import { collidesWith } from '@src/helpers/events';
import EventUIModel from '@src/model/eventUIModel';
import TZDate from '@src/time/date';
import { compare, MS_PER_DAY, parse, toEndOfDay, toStartOfDay } from '@src/time/datetime';
import { stamp } from '@src/utils/stamp';
import { isString } from '@src/utils/type';

import type {
  DateType,
  EventCategory,
  EventObject,
  EventObjectWithDefaultValues,
  EventState,
} from '@t/events';

/**
 * 事件模型类 - 负责管理日历事件的核心数据和行为
 * 实现了 EventObjectWithDefaultValues 接口（除了 __cid 属性）
 */
export default class EventModel implements Omit<EventObjectWithDefaultValues, '__cid'> {
  /** 事件唯一标识符 */
  id = '';

  /** 所属日历的ID */
  calendarId = '';

  /** 事件标题 */
  title = '';

  /** 事件详细内容 */
  body = '';

  /** 是否为全天事件 */
  isAllday = false;

  /** 事件开始时间 */
  start: TZDate = new TZDate();

  /** 事件结束时间 */
  end: TZDate = new TZDate();

  /** 前往事件地点的行程时间（分钟） */
  goingDuration = 0;

  /** 从事件地点返回的行程时间（分钟） */
  comingDuration = 0;

  /** 事件地点 */
  location = '';

  /** 事件参与者列表 */
  attendees: string[] = [];

  /** 事件类别：time(时间事件)、allday(全天事件)、milestone(里程碑)、task(任务) */
  category: EventCategory = 'time';

  /** 截止日期样式类名 */
  dueDateClass = '';

  /** 重复规则 */
  recurrenceRule = '';

  /** 事件状态：Busy(忙碌)、Free(空闲) */
  state: EventState = 'Busy';

  /** 事件是否可见 */
  isVisible = true;

  /** 事件是否为待处理状态 */
  isPending = false;

  /** 事件是否获得焦点 */
  isFocused = false;

  /** 事件是否为只读 */
  isReadOnly = false;

  /** 事件是否为私密 */
  isPrivate = false;

  /** 事件文字颜色 */
  color?: string;

  /** 事件背景颜色 */
  backgroundColor?: string;

  /** 拖拽时的背景颜色 */
  dragBackgroundColor?: string;

  /** 事件边框颜色 */
  borderColor?: string;

  /** 自定义样式对象 */
  customStyle = {};

  /** 原始事件数据 */
  raw: any = null;

  /**
   * 事件是否跨越多个日期
   * 注意：这个属性会影响事件卡片的宽度计算
   * 当事件持续时间超过24小时时，在多日视图中需要特殊处理
   */
  hasMultiDates = false;

  /**
   * 构造函数
   * @param event 事件对象数据
   */
  constructor(event: EventObject = {}) {
    // 为模型实例生成唯一ID
    stamp(this);

    this.init(event);
  }

  /** 事件数据验证模式 */
  static schema = {
    required: ['title'], // 标题为必填项
    dateRange: ['start', 'end'], // 开始和结束时间范围
  };

  /**
   * 初始化事件模型
   * @param event 事件对象数据
   */
  init({
    id = '',
    calendarId = '',
    title = '',
    body = '',
    isAllday = false,
    start = new TZDate(),
    end = new TZDate(),
    goingDuration = 0,
    comingDuration = 0,
    location = '',
    attendees = [],
    category = 'time',
    dueDateClass = '',
    recurrenceRule = '',
    state = 'Busy',
    isVisible = true,
    isPending = false,
    isFocused = false,
    isReadOnly = false,
    isPrivate = false,
    color,
    backgroundColor,
    dragBackgroundColor,
    borderColor,
    customStyle = {},
    raw = null,
  }: EventObject = {}) {
    this.id = id;
    this.calendarId = calendarId;
    this.title = title;
    this.body = body;
    // 如果类别是全天事件，强制设置为全天
    this.isAllday = category === 'allday' ? true : isAllday;
    this.goingDuration = goingDuration;
    this.comingDuration = comingDuration;
    this.location = location;
    this.attendees = attendees;
    this.category = category;
    this.dueDateClass = dueDateClass;
    this.recurrenceRule = recurrenceRule;
    this.state = state;
    this.isVisible = isVisible;
    this.isPending = isPending;
    this.isFocused = isFocused;
    this.isReadOnly = isReadOnly;
    this.isPrivate = isPrivate;
    this.color = color;
    this.backgroundColor = backgroundColor;
    this.dragBackgroundColor = dragBackgroundColor;
    this.borderColor = borderColor;
    this.customStyle = customStyle;
    this.raw = raw;

    // 根据事件类型设置时间周期
    if (this.isAllday) {
      this.setAlldayPeriod(start, end);
    } else {
      this.setTimePeriod(start, end);
    }

    // 里程碑和任务类型的事件，开始时间等于结束时间
    if (category === 'milestone' || category === 'task') {
      this.start = new TZDate(this.end);
    }
  }

  /**
   * 设置全天事件的时间周期
   * @param start 开始时间
   * @param end 结束时间
   */
  setAlldayPeriod(start?: DateType, end?: DateType) {
    // 全天事件只使用日期信息，忽略时间部分
    let startedAt: TZDate;
    let endedAt: TZDate;

    if (isString(start)) {
      // 如果是字符串，只取前10位（日期部分）
      startedAt = parse(start.substring(0, 10));
    } else {
      startedAt = new TZDate(start || Date.now());
    }

    if (isString(end)) {
      endedAt = parse(end.substring(0, 10));
    } else {
      endedAt = new TZDate(end || this.start);
    }

    this.start = startedAt;
    this.start.setHours(0, 0, 0); // 设置为当天开始
    this.end = (endedAt as TZDate) || new TZDate(this.start);
    this.end.setHours(23, 59, 59); // 设置为当天结束
  }

  /**
   * 设置时间事件的时间周期
   * @param start 开始时间
   * @param end 结束时间
   */
  setTimePeriod(start?: DateType, end?: DateType) {
    this.start = new TZDate(start || Date.now());
    this.end = new TZDate(end || this.start);

    // 如果没有指定结束时间，默认设置为开始时间后30分钟
    if (!end) {
      this.end.setMinutes(this.end.getMinutes() + 30);
    }

    // 检查是否跨越多个日期（超过24小时）
    // 这个属性对事件卡片的宽度计算很重要
    this.hasMultiDates = this.end.getTime() - this.start.getTime() > MS_PER_DAY;
  }

  /**
   * 获取渲染用的开始时间
   * @returns {TZDate} 开始时间
   */
  getStarts() {
    return this.start;
  }

  /**
   * 获取渲染用的结束时间
   * @returns {TZDate} 结束时间
   */
  getEnds() {
    return this.end;
  }

  /**
   * 获取实例的唯一ID
   * @returns {number} 唯一标识符
   */
  cid(): number {
    return stamp(this);
  }

  /**
   * 检查两个事件是否相等
   * 比较标题、全天状态、开始时间、结束时间等关键属性
   * @param {EventModel} event 要比较的事件模型实例
   * @returns {boolean} 如果相同返回true，否则返回false
   */
  // eslint-disable-next-line complexity
  equals(event: EventModel) {
    if (this.id !== event.id) {
      return false;
    }

    if (this.title !== event.title) {
      return false;
    }

    if (this.body !== event.body) {
      return false;
    }

    if (this.isAllday !== event.isAllday) {
      return false;
    }

    if (compare(this.getStarts(), event.getStarts()) !== 0) {
      return false;
    }

    if (compare(this.getEnds(), event.getEnds()) !== 0) {
      return false;
    }

    if (this.color !== event.color) {
      return false;
    }

    if (this.backgroundColor !== event.backgroundColor) {
      return false;
    }

    if (this.dragBackgroundColor !== event.dragBackgroundColor) {
      return false;
    }

    if (this.borderColor !== event.borderColor) {
      return false;
    }

    return true;
  }

  /**
   * 计算事件的持续时间
   * @returns {number} 持续时间（毫秒，UTC时间）
   */
  duration(): number {
    const start = Number(this.getStarts());
    const end = Number(this.getEnds());
    let duration: number;

    if (this.isAllday) {
      // 全天事件：从开始日期的开始到结束日期的结束
      duration = Number(toEndOfDay(end)) - Number(toStartOfDay(start));
    } else {
      // 时间事件：直接计算时间差
      duration = end - start;
    }

    return duration;
  }

  /**
   * 返回模型实例本身
   */
  valueOf() {
    return this;
  }

  /**
   * 检查当前事件是否与另一个事件时间冲突
   * @param {EventModel | EventUIModel} event 要比较的另一个事件
   * @param {boolean = true} usingTravelTime 计算冲突时是否考虑行程时间
   * @returns {boolean} 如果时间冲突返回true
   */
  collidesWith(event: EventModel | EventUIModel, usingTravelTime = true) {
    // 如果是UI模型，获取其底层的事件模型
    event = event instanceof EventUIModel ? event.model : event;

    return collidesWith({
      start: Number(this.getStarts()),
      end: Number(this.getEnds()),
      targetStart: Number(event.getStarts()),
      targetEnd: Number(event.getEnds()),
      goingDuration: this.goingDuration,
      comingDuration: this.comingDuration,
      targetGoingDuration: event.goingDuration,
      targetComingDuration: event.comingDuration,
      usingTravelTime, // 日网格不使用行程时间，时间网格使用行程时间
    });
  }

  /**
   * 将事件模型转换为事件对象
   * @returns {EventObjectWithDefaultValues} 事件对象
   */
  toEventObject(): EventObjectWithDefaultValues {
    return {
      id: this.id,
      calendarId: this.calendarId,
      __cid: this.cid(),
      title: this.title,
      body: this.body,
      isAllday: this.isAllday,
      start: this.start,
      end: this.end,
      goingDuration: this.goingDuration,
      comingDuration: this.comingDuration,
      location: this.location,
      attendees: this.attendees,
      category: this.category,
      dueDateClass: this.dueDateClass,
      recurrenceRule: this.recurrenceRule,
      state: this.state,
      isVisible: this.isVisible,
      isPending: this.isPending,
      isFocused: this.isFocused,
      isReadOnly: this.isReadOnly,
      isPrivate: this.isPrivate,
      color: this.color,
      backgroundColor: this.backgroundColor,
      dragBackgroundColor: this.dragBackgroundColor,
      borderColor: this.borderColor,
      customStyle: this.customStyle,
      raw: this.raw,
    };
  }

  /**
   * 获取事件的颜色配置
   * @returns 包含所有颜色属性的对象
   */
  getColors() {
    return {
      color: this.color,
      backgroundColor: this.backgroundColor,
      dragBackgroundColor: this.dragBackgroundColor,
      borderColor: this.borderColor,
    };
  }
}

// export function isBackgroundEvent({ model }: EventUIModel) {
//   return model.category === 'background';
// }

/**
 * 判断是否为时间事件（非全天、非多日事件）
 * 这个函数用于确定事件卡片的渲染方式
 * @param {EventUIModel} eventUI 事件UI模型
 * @returns {boolean} 如果是时间事件返回true
 */
export function isTimeEvent({ model }: EventUIModel) {
  const { category, isAllday, hasMultiDates } = model;

  // 时间事件：类别为time，非全天，非多日
  return category === 'time' && !isAllday && !hasMultiDates;
}
