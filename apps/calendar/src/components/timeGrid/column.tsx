import { h } from 'preact';
import { memo } from 'preact/compat';
import { useCallback } from 'preact/hooks';

import { TimeEvent } from '@src/components/events/timeEvent';
import { GridSelectionByColumn } from '@src/components/timeGrid/gridSelectionByColumn';
import { useTheme } from '@src/contexts/themeStore';
import { cls } from '@src/helpers/css';
import { usePrimaryTimezone } from '@src/hooks/timezone/usePrimaryTimezone';
import type EventUIModel from '@src/model/eventUIModel';
import type TZDate from '@src/time/date';
import { isSameDate, isWeekend } from '@src/time/datetime';

import type { GridPositionFinder, TimeGridData } from '@t/grid';
import type { ThemeState } from '@t/theme';

import { ResizingGuideByColumn } from './resizingGuideByColumn';

/**
 * CSS 类名常量定义
 * 用于统一管理组件的样式类名
 */
const classNames = {
  column: cls('column'), // 时间列容器
  backgrounds: cls('background-events'), // 背景事件容器
  events: cls('events'), // 事件容器
};

/**
 * 背景事件组件（当前未实现）
 * 用于显示全天事件或背景事件
 *
 * @param eventUIModels - 事件UI模型数组
 * @param startTime - 时间网格开始时间
 * @param endTime - 时间网格结束时间
 */
// TODO: implement BackgroundEvents
// function BackgroundEvents({
//   eventUIModels,
//   startTime,
//   endTime,
// }: {
//   eventUIModels: EventUIModel[];
//   startTime: TZDate;
//   endTime: TZDate;
// }) {
//   const backgroundEvents = eventUIModels.filter(isBackgroundEvent);

//   return (
//     <div className={classNames.backgrounds}>
//       {backgroundEvents.map((eventUIModel, index) => {
//         const { top, height } = getTopHeightByTime(
//           eventUIModel.model.start,
//           eventUIModel.model.end,
//           startTime,
//           endTime
//         );

//         return (
//           <BackgroundEvent
//             uiModel={eventUIModel}
//             top={toPercent(top)}
//             height={toPercent(height)}
//             key={`backgroundEvent-${index}`}
//           />
//         );
//       })}
//     </div>
//   );
// }

/**
 * 垂直事件组件
 * 渲染时间网格中的垂直排列的事件
 *
 * @param eventUIModels - 事件UI模型数组
 * @param minEventHeight - 事件最小高度
 */
function VerticalEvents({
  eventUIModels,
  minEventHeight,
}: {
  eventUIModels: EventUIModel[];
  minEventHeight: number;
}) {
  // @TODO: 使用动态值替代硬编码的右边距
  const style = { marginRight: 8 };

  return (
    <div className={classNames.events} style={style}>
      {eventUIModels.map((eventUIModel) => (
        <TimeEvent
          key={`${eventUIModel.valueOf()}-${eventUIModel.cid()}`}
          uiModel={eventUIModel}
          minHeight={minEventHeight}
        />
      ))}
    </div>
  );
}

/**
 * 主题背景色选择器
 * 从主题状态中提取背景色相关的配置
 *
 * @param theme - 主题状态对象
 * @returns 包含各种背景色的对象
 */
function backgroundColorSelector(theme: ThemeState) {
  return {
    defaultBackgroundColor: theme.week.dayGrid.backgroundColor, // 默认背景色
    todayBackgroundColor: theme.week.today.backgroundColor, // 今天背景色
    weekendBackgroundColor: theme.week.weekend.backgroundColor, // 周末背景色
  };
}

/**
 * 获取列的背景色
 * 根据日期类型（今天、周末、普通工作日）返回对应的背景色
 *
 * @param today - 今天的日期
 * @param columnDate - 当前列的日期
 * @param defaultBackgroundColor - 默认背景色
 * @param todayBackgroundColor - 今天背景色
 * @param weekendBackgroundColor - 周末背景色
 * @returns 对应的背景色字符串
 */
function getBackgroundColor({
  today,
  columnDate,
  defaultBackgroundColor,
  todayBackgroundColor,
  weekendBackgroundColor,
}: {
  today: TZDate;
  columnDate: TZDate;
  defaultBackgroundColor: string;
  todayBackgroundColor: string;
  weekendBackgroundColor: string;
}) {
  // 判断是否为今天的列
  const isTodayColumn = isSameDate(today, columnDate);
  // 判断是否为周末
  const isWeekendColumn = isWeekend(columnDate.getDay());

  // 优先级：今天 > 周末 > 默认
  if (isTodayColumn) {
    return todayBackgroundColor;
  }

  if (isWeekendColumn) {
    return weekendBackgroundColor;
  }

  return defaultBackgroundColor;
}

/**
 * 时间网格列组件的属性接口
 */
interface Props {
  timeGridData: TimeGridData; // 时间网格数据
  columnDate: TZDate; // 当前列的日期
  columnWidth: string; // 列宽度
  columnIndex: number; // 列索引
  totalUIModels: EventUIModel[][]; // 所有列的UI模型数组
  gridPositionFinder: GridPositionFinder; // 网格位置查找器
  isLastColumn: boolean; // 是否为最后一列
  readOnly?: boolean; // 是否为只读模式
}

/**
 * 时间网格列组件
 * 负责渲染时间网格中的单个时间列，包括事件、背景、选择区域等
 *
 * 主要功能：
 * 1. 渲染垂直排列的时间事件
 * 2. 根据日期类型设置不同的背景色
 * 3. 提供事件拖拽和调整大小的视觉引导
 * 4. 支持网格选择功能
 */
export const Column = memo(function Column({
  columnDate,
  columnWidth,
  columnIndex,
  totalUIModels,
  gridPositionFinder,
  timeGridData,
  isLastColumn,
}: Props) {
  // 从时间网格数据中提取行信息
  const { rows: timeGridRows } = timeGridData;

  // 获取主题相关的样式配置
  const borderRight = useTheme(useCallback((theme) => theme.week.timeGrid.borderRight, []));
  const backgroundColorTheme = useTheme(backgroundColorSelector);

  // 获取当前时区的当前时间
  const [, getNow] = usePrimaryTimezone();
  const today = getNow();

  // 注释掉的代码：计算时间范围（用于背景事件）
  // const [startTime, endTime] = useMemo(() => {
  //   const { startTime: startTimeStr } = first(timeGridRows);
  //   const { endTime: endTimeStr } = last(timeGridRows);

  //   const start = setTimeStrToDate(columnDate, startTimeStr);
  //   const end = setTimeStrToDate(columnDate, endTimeStr);

  //   return [start, end];
  // }, [columnDate, timeGridRows]);

  // 根据日期类型计算背景色
  const backgroundColor = getBackgroundColor({ today, columnDate, ...backgroundColorTheme });

  // 构建列容器的样式
  const style = {
    width: columnWidth,
    backgroundColor,
    borderRight: isLastColumn ? 'none' : borderRight, // 最后一列不显示右边框
  };

  // 获取当前列的事件UI模型
  const uiModelsByColumn = totalUIModels[columnIndex];

  // 使用第一行的高度作为事件最小高度
  const minEventHeight = timeGridRows[0].height;

  return (
    <div
      className={classNames.column}
      style={style}
      data-testid={`timegrid-column-${columnDate.getDay()}`}
    >
      {/* 背景事件组件（当前未实现） */}
      {/* <BackgroundEvents eventUIModels={uiModelsByColumn} startTime={startTime} endTime={endTime} /> */}

      {/* 垂直事件组件 */}
      <VerticalEvents eventUIModels={uiModelsByColumn} minEventHeight={minEventHeight} />

      {/* 事件调整大小引导组件 */}
      <ResizingGuideByColumn
        gridPositionFinder={gridPositionFinder}
        totalUIModels={totalUIModels}
        columnIndex={columnIndex}
        timeGridData={timeGridData}
      />

      {/* 网格选择组件 */}
      <GridSelectionByColumn columnIndex={columnIndex} timeGridRows={timeGridRows} />
    </div>
  );
});
