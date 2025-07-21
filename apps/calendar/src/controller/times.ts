import type TZDate from '@src/time/date';
import { clone } from '@src/time/datetime';
import { limit, ratio } from '@src/utils/math';

import type { TimeUnit } from '@t/events';

/**
 * 根据时间计算在时间范围内的百分比位置
 *
 * 该函数用于计算指定时间在给定时间范围内的相对位置百分比。
 * 常用于确定事件在时间轴上的垂直位置。
 *
 * @param {TZDate} date - 要计算位置的目标时间
 * @param {TZDate} start - 时间范围的开始时间
 * @param {TZDate} end - 时间范围的结束时间
 * @returns {number} 返回0-100之间的百分比值，表示目标时间在时间范围内的相对位置
 *
 * @example
 * // 计算上午10点在9点到18点之间的位置
 * const start = new TZDate('2024-01-01T09:00:00');
 * const end = new TZDate('2024-01-01T18:00:00');
 * const time = new TZDate('2024-01-01T10:00:00');
 * const percent = getTopPercentByTime(time, start, end);
 * // 结果: 11.11 (表示在时间轴11.11%的位置)
 */
export function getTopPercentByTime(date: TZDate, start: TZDate, end: TZDate) {
  const startTime = start.getTime();
  const endTime = end.getTime();
  // 将目标时间限制在时间范围内，并计算相对于开始时间的偏移
  const time = limit(date.getTime(), [startTime], [endTime]) - startTime;
  const max = endTime - startTime;

  // 计算百分比位置
  const topPercent = ratio(max, 100, time);

  // 确保百分比在0-100范围内
  return limit(topPercent, [0], [100]);
}

/**
 * @typedef {Object} VerticalPositionsByTime
 * @property {number} top - 顶部位置百分比 (0-100)
 * @property {number} height - 高度百分比 (0-100)
 */
/**
 * 计算事件在时间网格中的垂直位置和高度
 *
 * 该函数用于确定事件在日历时间视图中应该显示的位置和大小。
 * 通过将时间范围转换为百分比值，实现事件在时间轴上的精确定位。
 *
 * @param {TZDate} start - 事件的开始时间，将被转换为顶部位置百分比
 * @param {TZDate} end - 事件的结束时间，用于计算事件高度
 * @param {TZDate} minTime - 时间网格的最小时间（通常是当天的开始时间）
 * @param {TZDate} maxTime - 时间网格的最大时间（通常是当天的结束时间）
 * @returns {VerticalPositionsByTime} 包含top和height属性的对象，表示事件的垂直位置信息
 *
 * @example
 * // 假设时间网格从 09:00 到 18:00
 * const minTime = new TZDate('2024-01-01T09:00:00');
 * const maxTime = new TZDate('2024-01-01T18:00:00');
 * const eventStart = new TZDate('2024-01-01T10:00:00');
 * const eventEnd = new TZDate('2024-01-01T12:00:00');
 *
 * const positions = getTopHeightByTime(eventStart, eventEnd, minTime, maxTime);
 * // 结果: { top: 11.11, height: 22.22 }
 * // 表示事件应该显示在距离顶部11.11%的位置，高度为22.22%
 */
export function getTopHeightByTime(start: TZDate, end: TZDate, minTime: TZDate, maxTime: TZDate) {
  // 计算事件开始时间相对于时间网格的顶部位置百分比
  const top = getTopPercentByTime(start, minTime, maxTime);

  // 计算事件结束时间相对于时间网格的底部位置百分比
  const bottom = getTopPercentByTime(end, minTime, maxTime);

  // 计算事件的高度百分比（底部位置减去顶部位置）
  const height = bottom - top;

  return {
    top, // 顶部位置百分比
    height, // 高度百分比
  };
}

/**
 * 根据时间单位设置时间值
 *
 * 该函数用于将时间对象的特定时间单位设置为指定值，其他单位会被重置为默认值。
 * 主要用于时间网格的计算和调整。
 *
 * @param {TZDate} time - 要修改的时间对象
 * @param {number} value - 要设置的新值
 * @param {TimeUnit} unit - 时间单位（minute/hour/date/month/year）
 * @returns {TZDate} 修改后的时间对象
 *
 * @example
 * const time = new TZDate('2024-01-15T14:30:45');
 * setValueByUnit(time, 10, 'hour'); // 设置为10点，分钟和秒会被重置为0
 * // 结果: 2024-01-15T10:00:00
 */
function setValueByUnit(time: TZDate, value: number, unit: TimeUnit) {
  if (unit === 'minute') {
    // 设置分钟，秒和毫秒重置为0
    time.setMinutes(value, 0, 0);
  } else if (unit === 'hour') {
    // 设置小时，分钟、秒和毫秒重置为0
    time.setHours(value, 0, 0, 0);
  } else if (unit === 'date') {
    // 设置日期，时间重置为00:00:00
    time.setHours(0, 0, 0, 0);
    time.setDate(value + 1);
  } else if (unit === 'month') {
    // 设置月份，日期设为1号，时间重置为00:00:00
    time.setHours(0, 0, 0, 0);
    time.setMonth(value, 1);
  } else if (unit === 'year') {
    // 设置年份，月份设为1月，日期设为1号，时间重置为00:00:00
    time.setHours(0, 0, 0, 0);
    time.setFullYear(value, 0, 1);
  }

  return time;
}

/**
 * 获取指定时间之前的网格时间
 *
 * 该函数用于在时间网格中找到指定时间之前的最近网格时间点。
 * 常用于事件拖拽、时间选择等场景中的网格对齐。
 *
 * @param {TZDate} time - 目标时间
 * @param {number} slot - 时间槽间隔（如30分钟、1小时等）
 * @param {TimeUnit} unit - 时间单位
 * @returns {TZDate} 返回目标时间之前的最近网格时间
 *
 * @example
 * // 获取14:30之前的30分钟网格时间
 * const time = new TZDate('2024-01-01T14:30:00');
 * const prevGrid = getPrevGridTime(time, 30, 'minute');
 * // 结果: 2024-01-01T14:00:00
 */
export function getPrevGridTime(time: TZDate, slot: number, unit: TimeUnit) {
  let index = 0;
  let prevGridTime = setValueByUnit(clone(time), slot * index, unit);
  let nextGridTime;

  index += 1;
  do {
    // 计算下一个网格时间点
    nextGridTime = setValueByUnit(clone(time), slot * index, unit);
    index += 1;

    // 如果下一个网格时间小于目标时间，更新前一个网格时间
    if (nextGridTime < time) {
      prevGridTime = clone(nextGridTime);
    }
  } while (nextGridTime <= time);

  return prevGridTime;
}

/**
 * 获取指定时间之后的网格时间
 *
 * 该函数用于在时间网格中找到指定时间之后的最近网格时间点。
 * 常用于事件拖拽、时间选择等场景中的网格对齐。
 *
 * @param {TZDate} time - 目标时间
 * @param {number} slot - 时间槽间隔（如30分钟、1小时等）
 * @param {TimeUnit} unit - 时间单位
 * @returns {TZDate} 返回目标时间之后的最近网格时间
 *
 * @example
 * // 获取14:30之后的30分钟网格时间
 * const time = new TZDate('2024-01-01T14:30:00');
 * const nextGrid = getNextGridTime(time, 30, 'minute');
 * // 结果: 2024-01-01T15:00:00
 */
export function getNextGridTime(time: TZDate, slot: number, unit: TimeUnit) {
  let index = 0;
  let nextGridTime;

  do {
    // 计算下一个网格时间点
    nextGridTime = setValueByUnit(clone(time), slot * index, unit);
    index += 1;
  } while (nextGridTime < time);

  return nextGridTime;
}
