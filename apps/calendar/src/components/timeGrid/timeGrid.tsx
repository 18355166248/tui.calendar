/**
 * 时间网格组件 - 日历的主要显示区域
 *
 * 功能包括：
 * - 显示时间轴和日期列
 * - 渲染事件块并处理重叠
 * - 提供网格选择和事件拖拽功能
 * - 显示当前时间指示器
 * - 支持重复事件的折叠显示
 */

import { h } from 'preact';
import { useCallback, useLayoutEffect, useMemo, useState } from 'preact/hooks';

import { addTimeGridPrefix, className as timegridClassName } from '@src/components/timeGrid';
import { Column } from '@src/components/timeGrid/column';
import { GridLines } from '@src/components/timeGrid/gridLines';
import { MovingEventShadow } from '@src/components/timeGrid/movingEventShadow';
import { NowIndicator } from '@src/components/timeGrid/nowIndicator';
import { TimeColumn } from '@src/components/timeGrid/timeColumn';
import { useStore } from '@src/contexts/calendarStore';
import { useTheme } from '@src/contexts/themeStore';
import { isBetween, setRenderInfoOfUIModels } from '@src/controller/column';
import { getTopPercentByTime } from '@src/controller/times';
import { cls, toPercent } from '@src/helpers/css';
import { createGridPositionFinder } from '@src/helpers/grid';
import { timeGridSelectionHelper } from '@src/helpers/gridSelection';
import { useDOMNode } from '@src/hooks/common/useDOMNode';
import { useInterval } from '@src/hooks/common/useInterval';
import { useIsMounted } from '@src/hooks/common/useIsMounted';
import { useGridSelection } from '@src/hooks/gridSelection/useGridSelection';
import { usePrimaryTimezone } from '@src/hooks/timezone/usePrimaryTimezone';
import type EventUIModel from '@src/model/eventUIModel';
import { optionsSelector } from '@src/selectors';
import { showNowIndicatorOptionSelector } from '@src/selectors/options';
import { weekTimeGridLeftSelector } from '@src/selectors/theme';
import type TZDate from '@src/time/date';
import {
  isSameDate,
  MS_PER_MINUTES,
  setTimeStrToDate,
  toEndOfDay,
  toStartOfDay,
} from '@src/time/datetime';
import type { CollapseDuplicateEventsOptions } from '@src/types/options';
import { first, last } from '@src/utils/array';
import { passConditionalProp } from '@src/utils/preact';
import { isPresent } from '@src/utils/type';

import type { TimeGridData } from '@t/grid';

// CSS 类名常量定义
const classNames = {
  timegrid: cls(timegridClassName),
  scrollArea: cls(addTimeGridPrefix('scroll-area')),
};

/**
 * TimeGrid 组件的属性接口
 */
interface Props {
  /** 要显示的事件列表 */
  events: EventUIModel[];
  /** 时间网格的数据结构，包含行列信息 */
  timeGridData: TimeGridData;
}

/**
 * 时间网格主组件
 *
 * @param timeGridData - 网格数据，包含时间行和日期列的信息
 * @param events - 需要在网格中显示的事件数组
 */
export function TimeGrid({ timeGridData, events }: Props) {
  // 从全局状态获取日历配置选项
  const {
    isReadOnly, // 是否只读模式
    week: { narrowWeekend, startDayOfWeek, collapseDuplicateEvents }, // 周视图配置
  } = useStore(optionsSelector);

  // 是否显示当前时间指示器
  const showNowIndicator = useStore(showNowIndicatorOptionSelector);

  // 当前选中的重复事件 ID
  const selectedDuplicateEventCid = useStore(
    (state) => state.weekViewLayout.selectedDuplicateEventCid
  );

  // 获取主时区和当前时间的 hook
  const [, getNow] = usePrimaryTimezone();

  // 组件挂载状态检查
  const isMounted = useIsMounted();

  // 获取时间列的宽度主题配置
  const { width: timeGridLeftWidth } = useTheme(weekTimeGridLeftSelector);

  // 当前时间指示器的状态
  const [nowIndicatorState, setNowIndicatorState] = useState<{
    top: number; // 指示器距离顶部的百分比位置
    now: TZDate; // 当前时间
  } | null>(null);

  // 解构网格数据
  const { columns, rows } = timeGridData;
  const lastColumnIndex = columns.length - 1;

  /**
   * 计算所有列的事件 UI 模型
   * 为每一列筛选当天的事件，并计算渲染信息（位置、重叠处理等）
   */
  const totalUIModels = useMemo(
    () =>
      columns
        // 为每个日期列筛选当天的事件
        .map(({ date }) =>
          events
            .filter(isBetween(toStartOfDay(date), toEndOfDay(date)))
            // 克隆事件模型避免列间共享引用
            .map((uiModel) => uiModel.clone())
        )
        // 为每列的事件设置渲染信息（位置、层级、重叠处理等）
        .map((uiModelsByColumn, columnIndex) =>
          setRenderInfoOfUIModels(
            uiModelsByColumn,
            setTimeStrToDate(columns[columnIndex].date, first(rows).startTime), // 列的开始时间
            setTimeStrToDate(columns[columnIndex].date, last(rows).endTime), // 列的结束时间
            selectedDuplicateEventCid, // 选中的重复事件
            collapseDuplicateEvents as CollapseDuplicateEventsOptions // 重复事件折叠选项
          )
        ),
    [columns, rows, events, selectedDuplicateEventCid, collapseDuplicateEvents]
  );

  /**
   * 计算当前日期相关数据
   * 用于确定是否需要显示当前时间指示器
   */
  const currentDateData = useMemo(() => {
    const now = getNow();

    // 查找当前日期在列中的索引
    const currentDateIndexInColumns = columns.findIndex((column) => isSameDate(column.date, now));

    if (currentDateIndexInColumns < 0) {
      return null; // 当前日期不在显示范围内
    }

    // 计算当前日期列的开始和结束时间
    const startTime = setTimeStrToDate(
      columns[currentDateIndexInColumns].date,
      timeGridData.rows[0].startTime
    );
    const endTime = setTimeStrToDate(
      columns[currentDateIndexInColumns].date,
      last(timeGridData.rows).endTime
    );

    return {
      startTime,
      endTime,
      currentDateIndex: currentDateIndexInColumns,
    };
  }, [columns, getNow, timeGridData.rows]);

  // 获取列容器的 DOM 节点引用
  const [columnsContainer, setColumnsContainer] = useDOMNode();

  /**
   * 创建网格位置查找器
   * 用于在鼠标交互时确定点击位置对应的网格坐标
   */
  const gridPositionFinder = useMemo(
    () =>
      createGridPositionFinder({
        rowsCount: rows.length,
        columnsCount: columns.length,
        container: columnsContainer,
        narrowWeekend, // 是否压缩周末显示
        startDayOfWeek, // 一周的开始日期
      }),
    [columns.length, columnsContainer, narrowWeekend, rows.length, startDayOfWeek]
  );

  /**
   * 网格选择处理函数
   * 处理鼠标拖拽选择时间范围的逻辑
   */
  const onMouseDown = useGridSelection({
    type: 'timeGrid',
    gridPositionFinder,
    selectionSorter: timeGridSelectionHelper.sortSelection, // 选择排序器
    dateGetter: timeGridSelectionHelper.getDateFromCollection, // 日期获取器
    dateCollection: timeGridData,
  });

  /**
   * 更新时间指示器位置
   * 计算当前时间在网格中的垂直位置百分比
   */
  const updateTimeGridIndicator = useCallback(() => {
    if (isPresent(currentDateData)) {
      const { startTime, endTime } = currentDateData;
      const now = getNow();

      // 只有当前时间在显示时间范围内时才显示指示器
      if (startTime <= now && now <= endTime) {
        setNowIndicatorState({
          top: getTopPercentByTime(now, startTime, endTime), // 计算垂直位置百分比
          now,
        });
      }
    }
  }, [currentDateData, getNow]);

  /**
   * 组件挂载后计算初始时间指示器位置
   */
  useLayoutEffect(() => {
    if (isMounted()) {
      if ((currentDateData?.currentDateIndex ?? -1) >= 0) {
        updateTimeGridIndicator();
      } else {
        setNowIndicatorState(null); // 当前日期不在显示范围时隐藏指示器
      }
    }
  }, [currentDateData, isMounted, updateTimeGridIndicator]);

  /**
   * 设置定时器定期更新时间指示器位置
   * 每分钟更新一次，如果当前日期不在显示范围则不启动定时器
   */
  useInterval(updateTimeGridIndicator, isPresent(currentDateData) ? MS_PER_MINUTES : null);

  return (
    <div className={classNames.timegrid}>
      <div className={classNames.scrollArea}>
        {/* 时间列 - 显示时间刻度 */}
        <TimeColumn timeGridRows={rows} nowIndicatorState={nowIndicatorState} />

        <div
          className={cls('columns')}
          style={{ left: timeGridLeftWidth }} // 设置左边距为时间列宽度
          ref={setColumnsContainer}
          onMouseDown={passConditionalProp(!isReadOnly, onMouseDown)} // 只读模式下禁用鼠标事件
        >
          {/* 网格线 - 显示时间分隔线 */}
          <GridLines timeGridRows={rows} />

          {/* 事件拖拽时的阴影效果 */}
          <MovingEventShadow gridPositionFinder={gridPositionFinder} timeGridData={timeGridData} />

          {/* 渲染所有日期列 */}
          {columns.map((column, index) => (
            <Column
              key={column.date.toString()}
              timeGridData={timeGridData}
              columnDate={column.date}
              columnWidth={toPercent(column.width)} // 转换为百分比宽度
              columnIndex={index}
              totalUIModels={totalUIModels}
              gridPositionFinder={gridPositionFinder}
              isLastColumn={index === lastColumnIndex} // 标记是否为最后一列
            />
          ))}

          {/* 当前时间指示器 - 仅在配置启用且当前日期在显示范围内时显示 */}
          {showNowIndicator && isPresent(currentDateData) && isPresent(nowIndicatorState) ? (
            <NowIndicator
              top={nowIndicatorState.top} // 垂直位置百分比
              columnWidth={columns[0].width} // 列宽度
              columnCount={columns.length} // 总列数
              columnIndex={currentDateData.currentDateIndex} // 当前日期所在列索引
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
