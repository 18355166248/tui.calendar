import { isSameEvent } from '@src/helpers/events';
import EventModel from '@src/model/eventModel';
import type EventUIModel from '@src/model/eventUIModel';
import type TZDate from '@src/time/date';
import { makeDateRange, MS_PER_DAY, toEndOfDay, toFormat, toStartOfDay } from '@src/time/datetime';
import Collection from '@src/utils/collection';

import type { CalendarData, EventObject, IDS_OF_DAY } from '@t/events';
import type { CalendarInfo } from '@t/options';

/**
 * 创建事件集合
 * 用于管理日历中的事件模型实例
 * @param {...T} initItems - 初始事件项数组
 * @returns {Collection<T>} 事件集合实例
 */
export function createEventCollection<T extends EventModel | EventUIModel>(...initItems: T[]) {
  // 创建一个新的集合，使用事件ID作为唯一标识符
  const collection = new Collection<T>((event) => event.cid());

  // 如果有初始项，则添加到集合中
  if (initItems.length) {
    collection.add(...initItems);
  }

  return collection;
}

/**
 * 计算事件包含的日期范围
 * 根据开始和结束日期生成该范围内的所有日期
 * @param {TZDate} start - 范围的开始日期
 * @param {TZDate} end - 范围的结束日期
 * @returns {TZDate[]} 包含的日期数组
 */
export function getDateRange(start: TZDate, end: TZDate) {
  return makeDateRange(toStartOfDay(start), toEndOfDay(end), MS_PER_DAY);
}

/**
 * 判断事件是否为全天事件
 * 全天事件的条件：
 * 1. 明确标记为全天事件
 * 2. 时间类别事件且持续时间超过一天
 * @param {EventModel} event - 事件模型实例
 * @returns {boolean} 是否为全天事件
 */
export function isAllday(event: EventModel) {
  return (
    event.isAllday ||
    (event.category === 'time' && Number(event.end) - Number(event.start) > MS_PER_DAY)
  );
}

/**
 * 根据事件类别进行分组过滤
 * 用于将事件按类型分组显示（全天事件、时间事件等）
 * @param {EventUIModel} uiModel - UI模型实例
 * @returns {string} 分组键名
 */
export function filterByCategory(uiModel: EventUIModel) {
  const { model } = uiModel;

  // 如果是全天事件，返回'allday'分组
  if (isAllday(model)) {
    return 'allday';
  }

  // 否则返回事件的原始类别
  return model.category;
}

/****************
 * 事件 CRUD 操作
 ****************/

/**
 * 将事件添加到日期矩阵中
 * 日期矩阵用于快速查找特定日期的事件
 * @param {IDS_OF_DAY} idsOfDay - 日期ID映射对象
 * @param {EventModel} event - 事件模型实例
 */
export function addToMatrix(idsOfDay: IDS_OF_DAY, event: EventModel) {
  // 获取事件包含的所有日期
  const containDates = getDateRange(event.getStarts(), event.getEnds());

  // 为每个包含的日期添加事件ID
  containDates.forEach((date) => {
    const ymd = toFormat(date, 'YYYYMMDD'); // 格式化为YYYYMMDD格式
    const matrix = (idsOfDay[ymd] = idsOfDay[ymd] || []); // 确保该日期的数组存在

    matrix.push(event.cid()); // 添加事件ID到该日期的数组中
  });
}

/**
 * 从日期矩阵中移除事件ID
 * 当事件被删除或更新时，需要清理矩阵中的引用
 * @param {IDS_OF_DAY} idsOfDay - 日期ID映射对象
 * @param {EventModel} event - 事件模型实例
 */
export function removeFromMatrix(idsOfDay: IDS_OF_DAY, event: EventModel) {
  const modelID = event.cid();

  // 遍历所有日期的ID数组
  Object.values(idsOfDay).forEach((ids: number[]) => {
    const index = ids.indexOf(modelID);

    // 如果找到事件ID，则从数组中移除
    if (~index) {
      ids.splice(index, 1);
    }
  });
}

/**
 * 添加事件到日历数据中
 * 将事件添加到事件集合并更新日期矩阵
 * @param {CalendarData} calendarData - 日历数据对象
 * @param {EventModel} event - 事件模型实例
 * @returns {EventModel} 添加的事件实例
 */
export function addEvent(calendarData: CalendarData, event: EventModel) {
  calendarData.events.add(event); // 添加到事件集合
  addToMatrix(calendarData.idsOfDay, event); // 更新日期矩阵

  return event;
}

/**
 * 创建新事件
 * 根据事件数据创建事件模型并添加到日历中
 * @param {CalendarData} calendarData - 日历数据对象
 * @param {EventObject} eventData - 事件数据对象
 * @returns {EventModel} 创建的事件实例
 */
export function createEvent(calendarData: CalendarData, eventData: EventObject) {
  const event = new EventModel(eventData); // 创建事件模型实例

  return addEvent(calendarData, event); // 添加到日历中
}

/**
 * 批量创建事件
 * 根据事件数据数组创建多个事件
 * @param {CalendarData} calendarData - 日历数据对象
 * @param {EventObject[]} events - 事件数据数组
 * @returns {EventModel[]} 创建的事件实例数组
 */
export function createEvents(calendarData: CalendarData, events: EventObject[] = []) {
  return events.map((eventData) => createEvent(calendarData, eventData));
}

/**
 * 更新事件
 * 根据事件ID和日历ID查找并更新事件数据
 * @param {CalendarData} calendarData - 日历数据对象
 * @param {string} eventId - 事件ID
 * @param {string} calendarId - 日历ID
 * @param {EventObject} eventData - 新的事件数据
 * @returns {boolean} 更新是否成功
 */
export function updateEvent(
  calendarData: CalendarData,
  eventId: string,
  calendarId: string,
  eventData: EventObject
) {
  const { idsOfDay } = calendarData;
  // 根据事件ID和日历ID查找事件
  const event = calendarData.events.find((item) => isSameEvent(item, eventId, calendarId));

  // 如果找不到事件，返回失败
  if (!event) {
    return false;
  }

  // 更新事件数据
  event.init({ ...event, ...eventData });

  // 从矩阵中移除旧的事件引用，然后添加新的引用
  removeFromMatrix(idsOfDay, event);
  addToMatrix(idsOfDay, event);

  return true;
}

/**
 * 删除事件
 * 从日历数据中完全移除事件实例
 * @param {CalendarData} calendarData - 日历数据对象
 * @param {EventModel} event - 要删除的事件模型实例
 * @returns {EventModel} 被删除的事件实例
 */
export function deleteEvent(calendarData: CalendarData, event: EventModel) {
  removeFromMatrix(calendarData.idsOfDay, event); // 从日期矩阵中移除
  calendarData.events.remove(event); // 从事件集合中移除

  return event;
}

/**
 * 清空所有事件
 * 清除日历中的所有事件数据和日期矩阵
 * @param {CalendarData} calendarData - 日历数据对象
 */
export function clearEvents(calendarData: CalendarData) {
  calendarData.idsOfDay = {}; // 清空日期矩阵
  calendarData.events.clear(); // 清空事件集合
}

/**
 * 设置日历列表
 * 更新日历数据中的日历信息列表
 * @param {CalendarData} calendarData - 日历数据对象
 * @param {CalendarInfo[]} calendars - 日历信息数组
 */
export function setCalendars(calendarData: CalendarData, calendars: CalendarInfo[]) {
  calendarData.calendars = calendars;
}

/**
 * 根据日期范围查找事件
 * 返回指定日期范围内的事件，按日期分组
 * 注意：只支持年月日（YMD）格式的日期查找
 * @param {CalendarData} calendarData - 日历数据对象
 * @param {{start: TZDate, end: TZDate}} condition - 查找条件，包含开始和结束日期
 * @returns {Record<string, EventModel[]>} 按日期分组的事件集合
 */
export function findByDateRange(
  calendarData: CalendarData,
  condition: { start: TZDate; end: TZDate }
): Record<string, EventModel[]> {
  const { start, end } = condition;
  const { events, idsOfDay } = calendarData;
  const range = getDateRange(start, end); // 获取日期范围内的所有日期
  const result: Record<string, EventModel[]> = {};
  let ids;
  let ymd;
  let uiModels: EventModel[];

  // 遍历范围内的每个日期
  range.forEach((date) => {
    ymd = toFormat(date, 'YYYYMMDD'); // 格式化为YYYYMMDD
    ids = idsOfDay[ymd]; // 获取该日期的事件ID数组
    uiModels = result[ymd] = []; // 初始化该日期的事件数组

    // 如果该日期有事件，则根据ID获取事件实例
    if (ids && ids.length) {
      uiModels.push(...ids.map((id) => events.get(id) as EventModel));
    }
  });

  return result;
}
