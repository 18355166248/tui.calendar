// Preact核心库导入
import { h } from 'preact';
import { useCallback, useMemo } from 'preact/hooks';

// 日历组件导入
import { GridHeader } from '@src/components/dayGridCommon/gridHeader'; // 网格头部组件
import { AlldayGridRow } from '@src/components/dayGridWeek/alldayGridRow'; // 全天事件行组件
import { OtherGridRow } from '@src/components/dayGridWeek/otherGridRow'; // 其他类型事件行组件
import { Layout } from '@src/components/layout'; // 布局容器组件
import { Panel } from '@src/components/panel'; // 面板组件
import { TimeGrid } from '@src/components/timeGrid/timeGrid'; // 时间网格组件
import { TimezoneLabels } from '@src/components/timeGrid/timezoneLabels'; // 时区标签组件
// 样式常量导入
import { WEEK_DAY_NAME_BORDER, WEEK_DAY_NAME_HEIGHT } from '@src/constants/style';
// 上下文Store Hooks导入
import { useStore } from '@src/contexts/calendarStore'; // 日历状态管理
import { useTheme } from '@src/contexts/themeStore'; // 主题状态管理
// 工具函数导入
import { cls } from '@src/helpers/css'; // CSS类名处理工具
import { getDayNames } from '@src/helpers/dayName'; // 获取日期名称
import { createTimeGridData, getWeekViewEvents } from '@src/helpers/grid'; // 网格数据处理
import { getActivePanels } from '@src/helpers/view'; // 获取激活面板
// 自定义Hooks导入
import { useCalendarData } from '@src/hooks/calendar/useCalendarData'; // 日历数据获取
import { useDOMNode } from '@src/hooks/common/useDOMNode'; // DOM节点引用
import { useTimeGridScrollSync } from '@src/hooks/timeGrid/useTimeGridScrollSync'; // 时间网格滚动同步
import { useTimezoneLabelsTop } from '@src/hooks/timeGrid/useTimezoneLabelsTop'; // 时区标签定位
// 状态选择器导入
import {
  calendarSelector, // 日历数据选择器
  optionsSelector, // 选项配置选择器
  viewSelector, // 视图状态选择器
  weekViewLayoutSelector, // 周视图布局选择器
} from '@src/selectors';
import { primaryTimezoneSelector } from '@src/selectors/timezone'; // 主时区选择器
// 时间处理函数导入
import { addDate, getRowStyleInfo, toEndOfDay, toStartOfDay } from '@src/time/datetime';

// 类型定义导入
import type { WeekOptions } from '@t/options'; // 周视图选项类型
import type { AlldayEventCategory } from '@t/panel'; // 全天事件分类类型

/**
 * 日视图状态管理Hook
 * 用于获取和管理日视图所需的所有状态数据
 */
function useDayViewState() {
  // 获取日历数据
  const calendar = useStore(calendarSelector);
  // 获取日历选项配置
  const options = useStore(optionsSelector);
  // 获取周视图布局信息
  const { dayGridRows: gridRowLayout, lastPanelType } = useStore(weekViewLayoutSelector);
  // 获取当前渲染日期
  const { renderDate } = useStore(viewSelector);

  // 使用useMemo优化性能，只有依赖项变化时才重新计算
  return useMemo(
    () => ({
      calendar,
      options,
      gridRowLayout,
      lastPanelType,
      renderDate,
    }),
    [calendar, options, gridRowLayout, lastPanelType, renderDate]
  );
}

/**
 * 日视图组件
 * 渲染单日的日历视图，包括全天事件、时间网格和其他类型事件
 */
export function Day() {
  // 获取日视图所需的状态数据
  const { calendar, options, gridRowLayout, lastPanelType, renderDate } = useDayViewState();

  // 获取主时区名称
  const primaryTimezoneName = useStore(primaryTimezoneSelector);

  // 获取网格头部左侧边距样式
  const gridHeaderMarginLeft = useTheme(useCallback((theme) => theme.week.dayGridLeft.width, []));
  // 创建时间面板的DOM引用
  const [timePanel, setTimePanelRef] = useDOMNode<HTMLDivElement>();

  // 获取周视图选项配置
  const weekOptions = options.week as Required<WeekOptions>;
  const { narrowWeekend, startDayOfWeek, workweek, hourStart, hourEnd, eventView, taskView } =
    weekOptions;

  // 创建包含当前渲染日期的数组（日视图只显示一天）
  const days = useMemo(() => [renderDate], [renderDate]);

  // 获取日期名称显示文本
  const dayNames = getDayNames(days, options.week?.dayNames ?? []);

  // 计算行样式信息和单元格宽度映射
  const { rowStyleInfo, cellWidthMap } = getRowStyleInfo(
    days.length,
    narrowWeekend,
    startDayOfWeek,
    workweek
  );

  // 获取日历数据（应用事件过滤器）
  const calendarData = useCalendarData(calendar, options.eventFilter);

  // 计算日网格事件数据
  const dayGridEvents = useMemo(() => {
    // 获取过滤日期范围的函数
    const getFilterRange = () => {
      // 如果是本地时区，只需要当天的范围
      if (primaryTimezoneName === 'Local') {
        return [toStartOfDay(days[0]), toEndOfDay(days[0])];
      }

      // 注意：由于时区偏移差异，需要扩展过滤范围
      return [toStartOfDay(addDate(days[0], -1)), toEndOfDay(addDate(days[0], 1))];
    };

    const [weekStartDate, weekEndDate] = getFilterRange();

    // 获取周视图事件数据
    return getWeekViewEvents(days, calendarData, {
      narrowWeekend,
      hourStart,
      hourEnd,
      weekStartDate,
      weekEndDate,
    });
  }, [calendarData, days, hourEnd, hourStart, narrowWeekend, primaryTimezoneName]);

  // 创建时间网格数据
  const timeGridData = useMemo(
    () =>
      createTimeGridData(days, {
        hourStart,
        hourEnd,
        narrowWeekend,
      }),
    [days, hourEnd, hourStart, narrowWeekend]
  );

  // 获取激活的面板类型
  const activePanels = getActivePanels(taskView, eventView);

  // 生成网格行组件
  const gridRows = activePanels.map((key) => {
    // 时间面板单独处理
    if (key === 'time') {
      return null;
    }

    const rowType = key as AlldayEventCategory;

    return (
      <Panel key={rowType} name={rowType} resizable={rowType !== lastPanelType}>
        {rowType === 'allday' ? (
          // 全天事件行
          <AlldayGridRow
            events={dayGridEvents[rowType]}
            rowStyleInfo={rowStyleInfo}
            gridColWidthMap={cellWidthMap}
            weekDates={days}
            height={gridRowLayout[rowType]?.height}
            options={weekOptions}
          />
        ) : (
          // 其他类型事件行（如任务等）
          <OtherGridRow
            category={rowType}
            events={dayGridEvents[rowType]}
            weekDates={days}
            height={gridRowLayout[rowType]?.height}
            options={weekOptions}
            gridColWidthMap={cellWidthMap}
          />
        )}
      </Panel>
    );
  });

  // 同步时间网格滚动
  useTimeGridScrollSync(timePanel, timeGridData.rows.length);

  // 获取时区标签的粘性定位top值
  const stickyTop = useTimezoneLabelsTop(timePanel);

  return (
    // 日视图布局容器
    <Layout className={cls('day-view')} autoAdjustPanels={true}>
      {/* 日期名称头部面板 */}
      <Panel name="day-view-day-names" initialHeight={WEEK_DAY_NAME_HEIGHT + WEEK_DAY_NAME_BORDER}>
        <GridHeader
          type="week"
          dayNames={dayNames}
          marginLeft={gridHeaderMarginLeft}
          rowStyleInfo={rowStyleInfo}
        />
      </Panel>

      {/* 渲染所有网格行（全天事件、任务等） */}
      {gridRows}

      {/* 时间网格面板（如果激活） */}
      {activePanels.includes('time') ? (
        <Panel name="time" autoSize={1} ref={setTimePanelRef}>
          {/* 时间网格组件，显示按时间段排列的事件 */}
          <TimeGrid events={dayGridEvents.time} timeGridData={timeGridData} />
          {/* 时区标签组件 */}
          <TimezoneLabels top={stickyTop} />
        </Panel>
      ) : null}
    </Layout>
  );
}
