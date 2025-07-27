/**
 * 周视图组件
 *
 * 这个组件负责渲染日历的周视图，包括：
 * - 星期标题栏
 * - 全天事件面板
 * - 任务和里程碑面板
 * - 时间网格面板
 * - 时区标签
 *
 * 主要功能：
 * - 根据周视图选项配置显示不同的面板
 * - 处理时区相关的日期过滤
 * - 管理面板布局和滚动同步
 * - 渲染各种类型的事件（全天事件、时间事件、任务等）
 */

import { h } from 'preact';
import { useCallback, useMemo } from 'preact/hooks';

// 导入组件
import { GridHeader } from '@src/components/dayGridCommon/gridHeader';
import { AlldayGridRow } from '@src/components/dayGridWeek/alldayGridRow';
import { OtherGridRow } from '@src/components/dayGridWeek/otherGridRow';
import { Layout } from '@src/components/layout';
import { Panel } from '@src/components/panel';
import { TimeGrid } from '@src/components/timeGrid/timeGrid';
import { TimezoneLabels } from '@src/components/timeGrid/timezoneLabels';
// 导入常量
import { WEEK_DAY_NAME_BORDER, WEEK_DAY_NAME_HEIGHT } from '@src/constants/style';
// 导入上下文和钩子
import { useStore } from '@src/contexts/calendarStore';
import { useTheme } from '@src/contexts/themeStore';
// 导入工具函数
import { cls } from '@src/helpers/css';
import { getDayNames } from '@src/helpers/dayName';
import { createTimeGridData, getWeekDates, getWeekViewEvents } from '@src/helpers/grid';
import { getActivePanels } from '@src/helpers/view';
// 导入自定义钩子
import { useCalendarData } from '@src/hooks/calendar/useCalendarData';
import { useDOMNode } from '@src/hooks/common/useDOMNode';
import { useTimeGridScrollSync } from '@src/hooks/timeGrid/useTimeGridScrollSync';
import { useTimezoneLabelsTop } from '@src/hooks/timeGrid/useTimezoneLabelsTop';
// 导入选择器
import {
  calendarSelector,
  optionsSelector,
  viewSelector,
  weekViewLayoutSelector,
} from '@src/selectors';
import { primaryTimezoneSelector } from '@src/selectors/timezone';
// 导入时间处理工具
import { addDate, getRowStyleInfo, toEndOfDay, toStartOfDay } from '@src/time/datetime';
import { first, last } from '@src/utils/array';

// 导入类型定义
import type { WeekOptions } from '@t/options';
import type { AlldayEventCategory } from '@t/panel';

/**
 * 周视图状态管理钩子
 *
 * 从全局状态中获取周视图所需的所有数据：
 * - options: 日历配置选项
 * - calendar: 日历数据
 * - gridRowLayout: 网格行布局信息
 * - lastPanelType: 最后一个面板类型
 * - renderDate: 当前渲染日期
 */
function useWeekViewState() {
  const options = useStore(optionsSelector);
  const calendar = useStore(calendarSelector);
  const { dayGridRows: gridRowLayout, lastPanelType } = useStore(weekViewLayoutSelector);
  const { renderDate } = useStore(viewSelector);

  return useMemo(
    () => ({
      options,
      calendar,
      gridRowLayout,
      lastPanelType,
      renderDate,
    }),
    [calendar, gridRowLayout, lastPanelType, options, renderDate]
  );
}

/**
 * 周视图主组件
 *
 * 渲染完整的周视图，包括：
 * 1. 星期标题栏 - 显示一周的日期名称
 * 2. 全天事件面板 - 显示全天事件
 * 3. 任务/里程碑面板 - 显示任务和里程碑
 * 4. 时间网格面板 - 显示按时间排列的事件
 * 5. 时区标签 - 显示时区信息
 */
export function Week() {
  // 获取周视图状态
  const { options, calendar, gridRowLayout, lastPanelType, renderDate } = useWeekViewState();

  // 获取主题中的网格头部左边距
  const gridHeaderMarginLeft = useTheme(useCallback((theme) => theme.week.dayGridLeft.width, []));

  // 获取主时区名称
  const primaryTimezoneName = useStore(primaryTimezoneSelector);

  // 时间面板的DOM引用
  const [timePanel, setTimePanelRef] = useDOMNode<HTMLDivElement>();

  // 提取周视图选项
  const weekOptions = options.week as Required<WeekOptions>;
  const { narrowWeekend, startDayOfWeek, workweek, hourStart, hourEnd, eventView, taskView } =
    weekOptions;

  // 计算一周的日期范围
  const weekDates = useMemo(() => getWeekDates(renderDate, weekOptions), [renderDate, weekOptions]);

  // 获取星期名称
  const dayNames = getDayNames(weekDates, options.week?.dayNames ?? []);

  // 计算行样式信息和单元格宽度映射
  const { rowStyleInfo, cellWidthMap } = getRowStyleInfo(
    weekDates.length,
    narrowWeekend,
    startDayOfWeek,
    workweek
  );

  // 获取日历数据
  const calendarData = useCalendarData(calendar, options.eventFilter);

  // 按面板分组的事件数据
  const eventByPanel = useMemo(() => {
    // 获取过滤范围
    const getFilterRange = () => {
      if (primaryTimezoneName === 'Local') {
        // 本地时区：使用周的开始和结束日期
        return [toStartOfDay(first(weekDates)), toEndOfDay(last(weekDates))];
      }

      // 非本地时区：扩展过滤范围以处理时区偏移差异
      // 注意：由于时区偏移差异，需要扩展过滤范围
      return [toStartOfDay(addDate(first(weekDates), -1)), toEndOfDay(addDate(last(weekDates), 1))];
    };

    const [weekStartDate, weekEndDate] = getFilterRange();

    // 获取周视图事件数据
    return getWeekViewEvents(weekDates, calendarData, {
      narrowWeekend,
      hourStart,
      hourEnd,
      weekStartDate,
      weekEndDate,
    });
  }, [calendarData, hourEnd, hourStart, narrowWeekend, primaryTimezoneName, weekDates]);

  // 创建时间网格数据
  const timeGridData = useMemo(
    () =>
      createTimeGridData(weekDates, {
        hourStart,
        hourEnd,
        narrowWeekend,
      }),
    [hourEnd, hourStart, narrowWeekend, weekDates]
  );

  // 获取活动的面板列表
  const activePanels = getActivePanels(taskView, eventView);

  // 渲染日期网格行（全天事件、任务等）
  const dayGridRows = activePanels.map((key) => {
    if (key === 'time') {
      // 时间面板单独处理
      return null;
    }

    const rowType = key as AlldayEventCategory;

    return (
      <Panel name={rowType} key={rowType} resizable={rowType !== lastPanelType}>
        {rowType === 'allday' ? (
          // 全天事件行
          <AlldayGridRow
            events={eventByPanel[rowType]}
            rowStyleInfo={rowStyleInfo}
            gridColWidthMap={cellWidthMap}
            weekDates={weekDates}
            height={gridRowLayout[rowType]?.height}
            options={weekOptions}
          />
        ) : (
          // 其他类型事件行（任务、里程碑等）
          <OtherGridRow
            category={rowType}
            events={eventByPanel[rowType]}
            weekDates={weekDates}
            height={gridRowLayout[rowType]?.height}
            options={weekOptions}
            gridColWidthMap={cellWidthMap}
          />
        )}
      </Panel>
    );
  });

  // 检查是否包含时间面板
  const hasTimePanel = useMemo(() => activePanels.includes('time'), [activePanels]);

  // 同步时间网格滚动
  useTimeGridScrollSync(timePanel, timeGridData.rows.length);

  // 获取时区标签的粘性顶部位置
  const stickyTop = useTimezoneLabelsTop(timePanel);

  return (
    <Layout className={cls('week-view')} autoAdjustPanels={true}>
      {/* 星期标题栏面板 */}
      <Panel
        name="week-view-day-names"
        initialHeight={WEEK_DAY_NAME_HEIGHT + WEEK_DAY_NAME_BORDER * 2}
      >
        <GridHeader
          type="week"
          dayNames={dayNames}
          marginLeft={gridHeaderMarginLeft}
          options={weekOptions}
          rowStyleInfo={rowStyleInfo}
        />
      </Panel>

      {/* 日期网格行（全天事件、任务等） */}
      {dayGridRows}

      {/* 时间面板 */}
      {hasTimePanel ? (
        <Panel name="time" autoSize={1} ref={setTimePanelRef}>
          <TimeGrid events={eventByPanel.time} timeGridData={timeGridData} />
          <TimezoneLabels top={stickyTop} />
        </Panel>
      ) : null}
    </Layout>
  );
}
