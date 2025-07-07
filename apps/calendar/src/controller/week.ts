import { filterByCategory, getDateRange } from '@src/controller/base';
import {
  convertToUIModel,
  getCollisionGroup,
  getEventInDateRangeFilter,
  getMatrices,
  limitRenderRange,
  positionUIModels,
} from '@src/controller/core';
import type EventModel from '@src/model/eventModel';
import type EventUIModel from '@src/model/eventUIModel';
import TZDate from '@src/time/date';
import { toEndOfDay, toFormat, toStartOfDay } from '@src/time/datetime';
import array from '@src/utils/array';
import type { Filter } from '@src/utils/collection';
import Collection from '@src/utils/collection';
import { isNil } from '@src/utils/type';

import type {
  CalendarData,
  DayGridEventMatrix,
  EventGroupMap,
  IDS_OF_DAY,
  Matrix3d,
} from '@t/events';
import type { WeekOptions } from '@t/options';
import type { Panel } from '@t/panel';

/**********
 * TIME GRID VIEW
 **********/

/**
 * 创建小时范围过滤函数，用于筛选在指定小时范围内的事件
 *
 * 该函数返回一个过滤函数，用于判断事件是否在指定的时间范围内显示。
 * 过滤逻辑考虑了事件的开始时间、结束时间与显示时间范围的各种重叠情况。
 *
 * @param {number} hStart - 显示时间范围的开始小时（0-23）
 * @param {number} hEnd - 显示时间范围的结束小时（0-23）
 * @returns {function} 返回一个过滤函数，接受事件模型参数，返回布尔值
 */
export function _makeHourRangeFilter(hStart: number, hEnd: number) {
  // eslint-disable-next-line complexity
  return (uiModel: EventModel | EventUIModel) => {
    // 获取事件的开始和结束时间
    const ownHourStart = uiModel.getStarts();
    const ownHourEnd = uiModel.getEnds();
    const ownHourStartTime = ownHourStart.getTime();
    const ownHourEndTime = ownHourEnd.getTime();

    // 提取事件的年月日信息，用于创建同一天的比较时间点
    const yyyy = ownHourStart.getFullYear();
    const mm = ownHourStart.getMonth();
    const dd = ownHourStart.getDate();

    // 创建显示时间范围的开始和结束时间点
    const hourStart = new TZDate(yyyy, mm, dd).setHours(hStart);
    const hourEnd = new TZDate(yyyy, mm, dd).setHours(hEnd);

    // 判断事件是否在显示时间范围内，考虑以下四种重叠情况：
    return (
      // 情况1：事件开始时间在显示范围内
      (ownHourStartTime >= hourStart && ownHourStartTime < hourEnd) ||
      // 情况2：事件结束时间在显示范围内
      (ownHourEndTime > hourStart && ownHourEndTime <= hourEnd) ||
      // 情况3：事件开始时间早于显示范围，但结束时间在显示范围内
      (ownHourStartTime < hourStart && ownHourEndTime > hourStart) ||
      // 情况4：事件开始时间在显示范围内，但结束时间晚于显示范围
      (ownHourEndTime > hourEnd && ownHourStartTime < hourEnd)
    );
  };
}

/**
 * 创建时间视图的UI模型处理函数
 *
 * 根据时间视图的显示小时范围配置，返回相应的UI模型处理函数。
 * 如果显示范围是全天（0-24小时），则只进行排序；否则会先过滤再排序。
 *
 * @param {number} hourStart - 时间视图显示的开始小时（0-23）
 * @param {number} hourEnd - 时间视图显示的结束小时（0-23）
 * @returns {function} 返回一个函数，接受UI模型集合，返回处理后的UI模型数组
 */
export function _makeGetUIModelFuncForTimeView(
  hourStart: number,
  hourEnd: number
): (uiModelColl: Collection<EventUIModel>) => EventUIModel[] {
  // 如果显示范围是全天（0-24小时），则不需要过滤，只进行排序
  if (hourStart === 0 && hourEnd === 24) {
    return (uiModelColl: Collection<EventUIModel>) => {
      return uiModelColl.sort(array.compare.event.asc);
    };
  }

  // 如果显示范围不是全天，则先按小时范围过滤，再按事件开始时间排序
  return (uiModelColl: Collection<EventUIModel>) => {
    return uiModelColl
      .filter(_makeHourRangeFilter(hourStart, hourEnd)) // 按小时范围过滤
      .sort(array.compare.event.asc); // 按事件开始时间升序排序
  };
}

/**
 * 按日期范围分割事件模型集合
 *
 * 该函数将事件集合按日期进行分组，每个日期对应一个事件集合。
 * 主要用于时间视图的事件渲染，确保每天的事件能够正确显示在对应的列中。
 *
 * @param {IDS_OF_DAY} idsOfDay - 日期索引映射，键为YYYYMMDD格式的日期字符串，值为该日期的事件ID数组
 * @param {TZDate} start - 日期范围的开始日期
 * @param {TZDate} end - 日期范围的结束日期
 * @param {Collection<EventModel | EventUIModel>} uiModelColl - 要分割的事件模型集合
 * @returns {Record<string, Collection>} 按日期分组的事件集合映射，键为YYYYMMDD格式的日期字符串
 */
export function splitEventByDateRange(
  idsOfDay: IDS_OF_DAY,
  start: TZDate,
  end: TZDate,
  uiModelColl: Collection<EventModel> | Collection<EventUIModel>
) {
  // 初始化结果对象，用于存储按日期分组的事件集合
  const result: Record<string, Collection<EventModel | EventUIModel>> = {};

  // 获取日期范围内的所有日期
  const range = getDateRange(start, end);

  // 遍历日期范围内的每一天
  range.forEach((date: TZDate) => {
    // 将日期格式化为YYYYMMDD字符串，用作结果对象的键
    const ymd = toFormat(date, 'YYYYMMDD');

    // 从日期索引中获取该日期的事件ID数组
    const ids = idsOfDay[ymd];

    // 为该日期创建一个新的事件集合，使用事件ID作为唯一标识
    const collection = (result[ymd] = new Collection<EventModel | EventUIModel>((event) => {
      return event.cid();
    }));

    // 如果该日期有事件，则将对应的事件添加到该日期的集合中
    if (ids && ids.length) {
      ids.forEach((id) => {
        uiModelColl.doWhenHas(id, (event: EventModel | EventUIModel) => {
          collection.add(event);
        });
      });
    }
  }, {});

  return result;
}

/**
 * 为时间视图部分创建UI模型矩阵
 *
 * 该函数处理时间视图的事件渲染，包括：
 * 1. 按日期分割事件集合
 * 2. 根据小时范围过滤事件
 * 3. 处理事件碰撞检测和布局
 * 4. 生成3D矩阵用于渲染
 *
 * @param {IDS_OF_DAY} idsOfDay - 日期索引映射，用于快速查找特定日期的事件
 * @param {object} condition - 查找条件对象
 *  @param {TZDate} condition.start - 开始日期
 *  @param {TZDate} condition.end - 结束日期
 *  @param {Collection<EventUIModel>} condition.uiModelTimeColl - 时间事件UI模型集合
 *  @param {number} condition.hourStart - 显示的开始小时（0-23）
 *  @param {number} condition.hourEnd - 显示的结束小时（0-23）
 * @returns {Record<string, Matrix3d<EventUIModel>>} 按日期分组的3D事件矩阵，键为YYYYMMDD格式的日期字符串
 */
export function getUIModelForTimeView(
  idsOfDay: IDS_OF_DAY,
  condition: {
    start: TZDate;
    end: TZDate;
    uiModelTimeColl: Collection<EventUIModel>;
    hourStart: number;
    hourEnd: number;
  }
) {
  console.log('🚀 ~ idsOfDay:', idsOfDay);
  // 解构条件参数
  const { start, end, uiModelTimeColl, hourStart, hourEnd } = condition;

  // 按日期范围分割事件集合
  const ymdSplitted = splitEventByDateRange(idsOfDay, start, end, uiModelTimeColl);

  // 初始化结果对象，用于存储每天的3D事件矩阵
  const result: Record<string, Matrix3d<EventUIModel>> = {};

  // 创建UI模型处理函数（包含小时范围过滤和排序）
  const _getUIModel = _makeGetUIModelFuncForTimeView(hourStart, hourEnd);

  // 启用旅行时间计算（用于更精确的碰撞检测）
  const usingTravelTime = true;

  // 遍历每天的事件集合，生成对应的3D矩阵
  Object.entries(ymdSplitted).forEach(([ymd, uiModelColl]) => {
    // 处理当天的UI模型（过滤、排序）
    const uiModels = _getUIModel(uiModelColl as Collection<EventUIModel>);

    // 计算事件碰撞组（用于处理重叠事件的布局）
    const collisionGroups = getCollisionGroup(uiModels, usingTravelTime);

    // 根据碰撞组生成3D矩阵
    const matrices = getMatrices(uiModelColl, collisionGroups, usingTravelTime);

    // 将结果存储到对应日期
    result[ymd] = matrices as Matrix3d<EventUIModel>;
  });

  return result;
}

/**********
 * ALLDAY VIEW
 **********/

/**
 * 为全天事件添加多日期信息
 *
 * 该函数为全天事件的UI模型设置多日期标志和渲染时间范围。
 * 全天事件通常跨越多个日期，需要特殊处理来确保正确渲染。
 *
 * @param {Collection<EventUIModel>} uiModelColl - UI模型集合
 */
export function _addMultiDatesInfo(uiModelColl: Collection<EventUIModel>) {
  uiModelColl.each((uiModel) => {
    const { model } = uiModel;

    // 设置多日期标志，表示该事件跨越多个日期
    model.hasMultiDates = true;

    // 设置渲染开始时间为事件开始日期的开始（00:00:00）
    uiModel.renderStarts = toStartOfDay(model.getStarts());

    // 设置渲染结束时间为事件结束日期的结束（23:59:59）
    uiModel.renderEnds = toEndOfDay(model.getEnds());
  });
}

/**
 * 为全天视图部分创建UI模型矩阵
 *
 * 该函数处理全天事件的渲染，包括：
 * 1. 为全天事件添加多日期信息
 * 2. 限制渲染范围在指定的日期范围内
 * 3. 处理事件碰撞检测和布局
 * 4. 定位UI模型在网格中的位置
 *
 * @param {TZDate} start - 开始日期
 * @param {TZDate} end - 结束日期
 * @param {Collection<EventUIModel>} uiModelColl - 全天事件UI模型集合
 * @returns {DayGridEventMatrix} 全天事件UI模型的2D矩阵，用于网格布局渲染
 */
export function getUIModelForAlldayView(
  start: TZDate,
  end: TZDate,
  uiModelColl: Collection<EventUIModel>
): DayGridEventMatrix {
  // 如果没有事件或事件集合为空，返回空矩阵
  if (!uiModelColl || !uiModelColl.size) {
    return [];
  }

  // 为全天事件添加多日期信息（设置渲染时间范围）
  _addMultiDatesInfo(uiModelColl);

  // 限制渲染范围在指定的日期范围内
  limitRenderRange(start, end, uiModelColl);

  // 按事件开始时间升序排序
  const uiModels = uiModelColl.sort(array.compare.event.asc);

  // 启用旅行时间计算（用于更精确的碰撞检测）
  const usingTravelTime = true;

  // 计算事件碰撞组（用于处理重叠事件的布局）
  const collisionGroups = getCollisionGroup(uiModels, usingTravelTime);

  // 根据碰撞组生成2D矩阵
  const matrices = getMatrices(uiModelColl, collisionGroups, usingTravelTime);

  // 在网格中定位UI模型（计算每个事件在网格中的位置）
  positionUIModels(start, end, matrices);

  return matrices;
}

/**********
 * READ
 **********/

/**
 * 在指定日期范围内查找并组织事件数据，用于周视图的渲染
 *
 * 该函数是周视图的核心控制器，负责：
 * 1. 根据日期范围过滤事件
 * 2. 将事件按类型分组（里程碑、任务、全天事件、时间事件）
 * 3. 为不同类型的事件生成相应的UI模型矩阵
 * 4. 处理时间视图的小时范围限制
 *
 * @param {CalendarData} calendarData - 日历数据存储对象，包含所有事件数据和日期索引
 * @param {object} condition - 查找条件对象
 *  @param {TZDate} condition.start - 查询的开始日期（包含）
 *  @param {TZDate} condition.end - 查询的结束日期（包含）
 *  @param {Array.<Panel>} condition.panels - 事件面板配置数组，定义要处理的事件类型
 *    支持的panel类型：
 *    - 'milestone': 里程碑事件
 *    - 'task': 任务事件
 *    - 'allday': 全天事件
 *    - 'time': 时间事件
 *  @param {Filter[]} condition.[andFilters] - 可选的额外过滤条件数组，用于进一步筛选事件
 *  @param {WeekOptions} condition.options - 周视图的配置选项
 *    - hourStart: 时间视图显示的开始小时（默认0）
 *    - hourEnd: 时间视图显示的结束小时（默认24）
 *
 * @returns {EventGroupMap} 按事件类型分组的事件UI模型映射对象
 *  返回结构：
 *  {
 *    milestone: [], // 里程碑事件矩阵
 *    task: [],      // 任务事件矩阵
 *    allday: [],    // 全天事件矩阵
 *    time: {}       // 时间事件矩阵（按日期分组）
 *  }
 */
export function findByDateRange(
  calendarData: CalendarData,
  condition: {
    start: TZDate;
    end: TZDate;
    panels: Panel[];
    andFilters: Filter<EventModel | EventUIModel>[];
    options: WeekOptions;
  }
) {
  // 解构条件参数，设置默认值
  const { start, end, panels, andFilters = [], options } = condition;

  // 从日历数据中提取事件集合和日期索引
  const { events, idsOfDay } = calendarData;

  // 获取时间视图的显示小时范围，设置默认值
  const hourStart = options?.hourStart ?? 0; // 默认从0点开始
  const hourEnd = options?.hourEnd ?? 24; // 默认到24点结束

  // 创建复合过滤函数：日期范围过滤 + 额外过滤条件
  const filterFn = Collection.and(...[getEventInDateRangeFilter(start, end)].concat(andFilters));

  // 过滤事件并转换为UI模型集合
  const uiModelColl = convertToUIModel(events.filter(filterFn));

  // 按事件类别（milestone、task、allday、time）分组
  const group: Record<string, Collection<EventUIModel>> = uiModelColl.groupBy(filterByCategory);

  // 遍历面板配置，为每种事件类型生成相应的UI模型矩阵
  return panels.reduce<EventGroupMap>(
    (acc, cur) => {
      const { name, type } = cur;

      // 如果该类型的事件不存在，跳过处理
      if (isNil(group[name])) {
        return acc;
      }

      // 根据面板类型选择不同的UI模型生成方法
      return {
        ...acc,
        [name]:
          type === 'daygrid'
            ? getUIModelForAlldayView(start, end, group[name]) // 全天事件：生成网格矩阵
            : getUIModelForTimeView(idsOfDay, {
                // 时间事件：生成时间视图矩阵
                start,
                end,
                uiModelTimeColl: group[name],
                hourStart,
                hourEnd,
              }),
      };
    },
    // 初始化返回对象，包含所有事件类型的默认值
    {
      milestone: [], // 里程碑事件矩阵
      task: [], // 任务事件矩阵
      allday: [], // 全天事件矩阵
      time: {}, // 时间事件矩阵（按日期分组）
    }
  );
}
