import type { MarkOptional } from 'ts-essentials';

import type EventModel from '@src/model/eventModel';
import type EventUIModel from '@src/model/eventUIModel';
import type TZDate from '@src/time/date';
import type Collection from '@src/utils/collection';

import type { StyleProp } from '@t/components/common';
import type { CalendarInfo } from '@t/options';

export type Matrix<T> = T[][];
export type Matrix3d<T> = Matrix<T>[];
export type CollisionGroup = Matrix<number>;

export type DayGridEventMatrix = Matrix3d<EventUIModel>;
export type TimeGridEventMatrix = Record<string, Matrix3d<EventUIModel>>;

export type EventModelMap = {
  milestone: EventUIModel[];
  allday: EventUIModel[];
  task: EventUIModel[];
  time: EventUIModel[];
};

export type EventGroupMap = Record<keyof EventModelMap, DayGridEventMatrix | TimeGridEventMatrix>;

export type DateType = Date | string | number | TZDate;

export type IDS_OF_DAY = Record<string, number[]>;

export interface CalendarData {
  calendars: CalendarInfo[];
  events: Collection<EventModel>;
  idsOfDay: IDS_OF_DAY;
}

export type EventCategory = 'milestone' | 'task' | 'allday' | 'time'; // | 'background';

export type EventState = 'Busy' | 'Free';

export type EventObjectWithDefaultValues = MarkOptional<
  Required<EventObject>,
  'color' | 'borderColor' | 'backgroundColor' | 'dragBackgroundColor'
> & {
  start: TZDate;
  end: TZDate;
  __cid: number;
};

/**
 * 事件对象接口 - 定义日历事件的基本属性和结构
 *
 * 这个接口描述了日历组件中事件的所有可能属性。
 * 所有属性都是可选的，允许灵活的事件数据配置。
 */
export interface EventObject {
  /**
   * 事件唯一标识符
   * 可选属性，用于各种用途的事件识别
   * 建议为每个事件提供唯一ID以便于事件管理和操作
   */
  id?: string;

  /**
   * 日历ID
   * 指定事件所属的日历，用于多日历场景下的事件分类和管理
   * 与 CalendarInfo 中的 id 字段对应
   */
  calendarId?: string;

  /**
   * 事件标题
   * 显示在日历界面中的主要文本内容
   * 通常作为事件的主要描述信息
   */
  title?: string;

  /**
   * 事件详细内容
   * 事件的详细描述或备注信息
   * 可以包含更丰富的事件描述内容
   */
  body?: string;

  /**
   * 全天事件标识
   * 当为 true 时，表示这是一个全天事件
   * 全天事件在日历中会以不同的样式显示，通常占据整行
   */
  isAllday?: boolean;

  /**
   * 事件开始时间
   * 支持多种时间格式：Date对象、时间字符串、时间戳或TZDate对象
   * 这是事件的必需时间属性之一
   */
  start?: DateType;

  /**
   * 事件结束时间
   * 支持多种时间格式：Date对象、时间字符串、时间戳或TZDate对象
   * 这是事件的必需时间属性之一
   */
  end?: DateType;

  /**
   * 前往时间
   * 到达事件地点所需的行程时间（以分钟为单位）
   * 用于计算实际需要出发的时间
   */
  goingDuration?: number;

  /**
   * 返回时间
   * 从事件地点返回所需的行程时间（以分钟为单位）
   * 用于计算事件结束后的实际可用时间
   */
  comingDuration?: number;

  /**
   * 事件地点
   * 事件发生的地理位置或场所信息
   * 可以显示在事件详情中
   */
  location?: string;

  /**
   * 事件参与者
   * 参与该事件的用户或联系人列表
   * 用于显示事件的参与人员信息
   */
  attendees?: string[];

  /**
   * 事件类别
   * 定义事件的类型，影响事件在日历中的显示方式
   * 可选值：'milestone'(里程碑)、'task'(任务)、'allday'(全天)、'time'(时间事件)
   */
  category?: EventCategory;

  /**
   * 到期日期分类
   * 工作事件的分类标识，如工作前、午餐前、工作后等
   * 用于特殊的时间段分类和样式应用
   */
  dueDateClass?: string;

  /**
   * 重复规则
   * 定义事件的重复模式，使用 iCalendar RRULE 格式
   * 例如："FREQ=WEEKLY;INTERVAL=1" 表示每周重复
   */
  recurrenceRule?: string;

  /**
   * 事件状态
   * 定义事件的可用性状态，默认为 'Busy'(忙碌)
   * 可选值：'Busy'(忙碌)、'Free'(空闲)
   * 影响其他日历系统对该事件的可用性判断
   */
  state?: EventState;

  /**
   * 可见性控制
   * 控制事件是否在日历界面中显示
   * 当为 false 时，事件将被隐藏但不会从数据中删除
   */
  isVisible?: boolean;

  /**
   * 待处理状态
   * 标识事件是否处于待处理或进行中状态
   * 通常用于显示特殊的状态指示器或样式
   */
  isPending?: boolean;

  /**
   * 焦点状态
   * 标识事件是否处于焦点状态
   * 用于键盘导航和用户交互的视觉反馈
   */
  isFocused?: boolean;

  /**
   * 只读状态
   * 当为 true 时，事件不可编辑或修改
   * 用于保护重要事件数据不被意外修改
   */
  isReadOnly?: boolean;

  /**
   * 私密状态
   * 标识事件是否为私密事件
   * 可能影响事件的显示方式和权限控制
   */
  isPrivate?: boolean;

  /**
   * 文本颜色
   * 事件元素中文本的颜色值
   * 支持CSS颜色格式：十六进制、RGB、颜色名称等
   */
  color?: string;

  /**
   * 背景颜色
   * 事件元素的背景颜色
   * 用于区分不同类型或重要程度的事件
   */
  backgroundColor?: string;

  /**
   * 拖拽背景颜色
   * 事件在拖拽过程中显示的背景颜色
   * 提供拖拽操作的视觉反馈
   */
  dragBackgroundColor?: string;

  /**
   * 边框颜色
   * 事件元素左边框的颜色
   * 通常用于标识事件类别或状态
   */
  borderColor?: string;

  /**
   * 自定义样式
   * 为事件元素应用自定义的CSS样式
   * 允许更精细的样式控制和个性化定制
   */
  customStyle?: StyleProp;

  /**
   * 原始数据
   * 存储事件的原始数据对象
   * 用于保存与日历组件无关的额外信息
   * 类型为 any，提供最大的灵活性
   */
  raw?: any;
}

export type BooleanKeyOfEventObject =
  | 'isPrivate'
  | 'isAllday'
  | 'isPending'
  | 'isFocused'
  | 'isVisible'
  | 'isReadOnly';

export type TimeUnit = 'second' | 'minute' | 'hour' | 'date' | 'month' | 'year';
