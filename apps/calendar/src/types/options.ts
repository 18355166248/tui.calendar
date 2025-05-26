import type { ComponentType } from 'preact';

import type { DeepPartial } from 'ts-essentials';

import type { EventObject, EventObjectWithDefaultValues } from '@t/events';
import type { TemplateConfig } from '@t/template';
import type { ThemeState } from '@t/theme';

// 事件视图类型：'allday'(全天事件) 或 'time'(时间事件)
export type EventView = 'allday' | 'time';
// 任务视图类型：'milestone'(里程碑) 或 'task'(任务)
export type TaskView = 'milestone' | 'task';

/**
 * 重复事件折叠选项接口
 */
export interface CollapseDuplicateEventsOptions {
  // 获取重复事件的函数
  getDuplicateEvents: (
    targetEvent: EventObjectWithDefaultValues,
    events: EventObjectWithDefaultValues[]
  ) => EventObjectWithDefaultValues[];
  // 获取主要事件的函数
  getMainEvent: (events: EventObjectWithDefaultValues[]) => EventObjectWithDefaultValues;
}

/**
 * 周视图选项接口
 */
export interface WeekOptions {
  // 一周的开始日期，0表示周日，1表示周一，依此类推
  startDayOfWeek?: number;
  // 自定义星期几的名称，数组包含7个字符串，从周日到周六
  dayNames?: [string, string, string, string, string, string, string] | [];
  // 是否缩小周末列的宽度（缩小为平日宽度的一半）
  narrowWeekend?: boolean;
  // 是否只显示工作日（即不显示周末）
  workweek?: boolean;
  // 是否显示当前时间指示器
  showNowIndicator?: boolean;
  // 是否显示时区折叠按钮
  showTimezoneCollapseButton?: boolean;
  // 时区是否默认折叠
  timezonesCollapsed?: boolean;
  // 一天的开始小时（0-24）
  hourStart?: number;
  // 一天的结束小时（0-24）
  hourEnd?: number;
  // 是否启用事件视图，或指定要显示的事件视图类型数组
  eventView?: boolean | EventView[];
  // 是否启用任务视图，或指定要显示的任务视图类型数组
  taskView?: boolean | TaskView[];
  // 是否折叠重复事件，或提供自定义折叠选项
  collapseDuplicateEvents?: boolean | Partial<CollapseDuplicateEventsOptions>;
}

/**
 * 月视图选项接口
 */
export interface MonthOptions {
  // 自定义星期几的名称，数组包含7个字符串，从周日到周六
  dayNames?: [string, string, string, string, string, string, string] | [];
  // 一周的开始日期，0表示周日，1表示周一，依此类推
  startDayOfWeek?: number;
  // 是否缩小周末列的宽度（缩小为平日宽度的一半）
  narrowWeekend?: boolean;
  // 可见周数
  visibleWeeksCount?: number;
  // 是否始终显示6周（无论当月实际有多少周）
  isAlways6Weeks?: boolean;
  // 是否只显示工作日（即不显示周末）
  workweek?: boolean;
  // 每天可见的事件数量
  visibleEventCount?: number;
}

/**
 * 网格选择选项接口
 */
export interface GridSelectionOptions {
  // 是否启用双击选择
  enableDblClick?: boolean;
  // 是否启用单击选择
  enableClick?: boolean;
}

/**
 * 时区配置接口
 */
export interface TimezoneConfig {
  // 时区名称
  timezoneName: string;
  // 显示标签
  displayLabel?: string;
  // 悬停提示
  tooltip?: string;
}

/**
 * 时区选项接口
 */
export interface TimezoneOptions {
  // 时区配置数组
  zones?: TimezoneConfig[];
  // 自定义偏移计算器函数
  customOffsetCalculator?: (timezoneName: string, timestamp: number) => number;
}

/**
 * 日历颜色接口
 */
export interface CalendarColor {
  // 文本颜色
  color?: string;
  // 背景颜色
  backgroundColor?: string;
  // 拖拽时的背景颜色
  dragBackgroundColor?: string;
  // 边框颜色
  borderColor?: string;
}

/**
 * 日历信息接口，继承自CalendarColor
 */
export interface CalendarInfo extends CalendarColor {
  // 日历唯一标识符
  id: string;
  // 日历名称
  name: string;
}

// 视图类型：'month'(月视图), 'week'(周视图), 或 'day'(日视图)
export type ViewType = 'month' | 'week' | 'day';

/**
 * 日历主选项接口
 */
export interface Options {
  // 默认视图类型
  defaultView?: ViewType;
  // 主题设置
  theme?: DeepPartial<ThemeState>;
  // 模板配置
  template?: TemplateConfig;
  // 周视图选项
  week?: WeekOptions;
  // 月视图选项
  month?: MonthOptions;
  // 日历列表
  calendars?: CalendarInfo[];
  // 是否使用表单弹窗
  useFormPopup?: boolean;
  // 是否使用详情弹窗
  useDetailPopup?: boolean;
  // 是否启用网格选择，或提供自定义网格选择选项
  gridSelection?: boolean | GridSelectionOptions;
  // 日历是否为只读模式
  isReadOnly?: boolean;
  // 是否启用使用统计
  usageStatistics?: boolean;
  // 事件过滤器函数
  eventFilter?: (event: EventObject) => boolean;
  // 时区选项
  timezone?: TimezoneOptions;
}

/**
 * 用户自定义视图信息接口
 */
export interface ViewInfoUserInput {
  // 视图组件
  component: ComponentType<any>;
  // 路由配置
  router?: {
    // 链接标题
    linkTitle: string;
  };
}

// 视图列表映射类型
export type ViewListMap = {
  [key: string]: ViewInfoUserInput;
};
