import { useMemo } from 'preact/hooks';

import { useEventsWithTimezone } from '@src/hooks/timezone/useEventsWithTimezone';
import type EventModel from '@src/model/eventModel';
import type { Filter } from '@src/utils/collection';
import Collection from '@src/utils/collection';

import type { CalendarData } from '@t/events';

/**
 * 日历数据 Hook
 *
 * 这个 hook 用于处理日历数据，主要功能包括：
 * 1. 根据传入的过滤器对日历事件进行过滤
 * 2. 处理时区相关的逻辑
 * 3. 返回处理后的日历数据
 *
 * @param calendar - 原始日历数据对象
 * @param filters - 可选的过滤器数组，用于过滤事件
 * @returns 处理后的日历数据，包含过滤后的事件
 */
export function useCalendarData(calendar: CalendarData, ...filters: Filter<EventModel>[]) {
  // 使用 useMemo 优化性能，根据日历事件和过滤器计算过滤后的事件
  // 只有当 calendar.events 或 filters 发生变化时才重新计算
  const filteredEvents = useMemo(
    () => calendar.events.filter(Collection.and<EventModel>(...filters)),
    [calendar.events, filters]
  );

  // 使用 useEventsWithTimezone hook 处理时区相关的逻辑
  // 确保事件在正确的时区下显示
  const filteredEventsWithTimezone = useEventsWithTimezone(filteredEvents);

  // 返回处理后的日历数据
  // 使用 useMemo 确保只有在依赖项变化时才重新创建对象
  return useMemo(
    () => ({
      ...calendar, // 保留原始日历数据的所有属性
      events: filteredEventsWithTimezone, // 替换为处理后的过滤事件
    }),
    [calendar, filteredEventsWithTimezone]
  );
}
