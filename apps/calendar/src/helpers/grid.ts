import range from 'tui-code-snippet/array/range';

import { DEFAULT_VISIBLE_WEEKS } from '@src/constants/grid';
import { findByDateRange } from '@src/controller/month';
import { findByDateRange as findByDateRangeForWeek } from '@src/controller/week';
import type EventUIModel from '@src/model/eventUIModel';
import TZDate from '@src/time/date';
import {
  addDate,
  Day,
  getDateDifference,
  isWeekend,
  subtractDate,
  toEndOfDay,
  toEndOfMonth,
  toStartOfDay,
  toStartOfMonth,
  WEEK_DAYS,
} from '@src/time/datetime';
import { findLastIndex } from '@src/utils/array';
import { limit, ratio } from '@src/utils/math';
import { isNil } from '@src/utils/type';

import type {
  CalendarData,
  DayGridEventMatrix,
  EventModelMap,
  Matrix3d,
  TimeGridEventMatrix,
} from '@t/events';
import type { CommonGridColumn, GridPositionFinder, TimeGridData } from '@t/grid';
import type { ClientMousePosition } from '@t/mouse';
import type { MonthOptions, WeekOptions } from '@t/options';
import type { Panel } from '@t/panel';
import type { FormattedTimeString } from '@t/time/datetime';

// 事件高度常量（像素）
export const EVENT_HEIGHT = 22;
// 总宽度常量（百分比）
export const TOTAL_WIDTH = 100;

/**
 * 遍历三维矩阵
 * 对三维矩阵中的每个元素执行指定的迭代函数
 * 使用嵌套的 forEach 循环遍历三维数组结构
 *
 * @param matrices 三维矩阵 - 结构为 matrices[matrix][row][element]
 * @param iteratee 迭代函数 - 对每个元素执行的操作，接收当前元素和索引
 */
function forEachMatrix3d<T>(matrices: Matrix3d<T>, iteratee: (target: T, index?: number) => void) {
  // 遍历第一维：矩阵数组
  matrices.forEach((matrix) => {
    // 遍历第二维：行数组
    matrix.forEach((row) => {
      // 遍历第三维：元素数组
      row.forEach((value, index) => {
        // 对每个元素执行指定的迭代函数
        iteratee(value, index);
      });
    });
  });
}

/**
 * 检查事件是否在容器高度范围内
 *
 * @param containerHeight 容器高度
 * @param eventHeight 事件高度
 * @returns 返回一个函数，该函数检查事件UI模型是否在容器高度范围内
 */
export function isWithinHeight(containerHeight: number, eventHeight: number) {
  return ({ top }: EventUIModel) => containerHeight >= top * eventHeight;
}

/**
 * 检查事件是否超出容器高度
 *
 * @param containerHeight 容器高度
 * @param eventHeight 事件高度
 * @returns 返回一个函数，该函数检查事件UI模型是否超出容器高度
 */
export function isExceededHeight(containerHeight: number, eventHeight: number) {
  return ({ top }: EventUIModel) => containerHeight < top * eventHeight;
}

/**
 * 获取超出容器高度的事件数量
 *
 * @param uiModel 事件UI模型数组
 * @param containerHeight 容器高度
 * @param eventHeight 事件高度
 * @returns 超出容器高度的事件数量
 */
export function getExceedCount(
  uiModel: EventUIModel[],
  containerHeight: number,
  eventHeight: number
) {
  return uiModel.filter(isExceededHeight(containerHeight, eventHeight)).length;
}

/**
 * 获取一行中周末日期的数量
 *
 * @param row 日期数组
 * @returns 周末日期数量
 */
const getWeekendCount = (row: TZDate[]) => row.filter((cell) => isWeekend(cell.getDay())).length;

/**
 * 获取网格宽度和左边距百分比值
 * 根据是否缩窄周末来计算每列的宽度和位置
 *
 * @param row 日期数组
 * @param narrowWeekend 是否缩窄周末显示
 * @param totalWidth 总宽度
 * @returns 包含宽度列表和左边距列表的对象
 */
export function getGridWidthAndLeftPercentValues(
  row: TZDate[],
  narrowWeekend: boolean,
  totalWidth: number
) {
  const weekendCount = getWeekendCount(row);
  const gridCellCount = row.length;
  const isAllWeekend = weekendCount === gridCellCount;
  const widthPerDay =
    totalWidth /
    (narrowWeekend && !isAllWeekend ? gridCellCount * 2 - weekendCount : gridCellCount);

  const widthList: number[] = row.map((cell) => {
    const day = cell.getDay();

    if (!narrowWeekend || isAllWeekend) {
      return widthPerDay;
    }

    return isWeekend(day) ? widthPerDay : widthPerDay * 2;
  });

  const leftList = widthList.reduce<number[]>(
    (acc, _, index) => (index ? [...acc, acc[index - 1] + widthList[index - 1]] : [0]),
    []
  );

  return {
    widthList,
    leftList,
  };
}

/**
 * 计算指定范围内列的宽度总和
 *
 * @param widthList 宽度列表
 * @param start 起始索引
 * @param end 结束索引
 * @returns 宽度总和
 */
export function getWidth(widthList: number[], start: number, end: number) {
  return widthList.reduce((acc, width, index) => {
    if (start <= index && index <= end) {
      return acc + width;
    }

    return acc;
  }, 0);
}

/**
 * 检查事件是否在指定网格日期范围内
 *
 * @param gridDate 网格日期
 * @returns 返回一个函数，该函数检查事件UI模型是否在指定日期范围内
 */
export const isInGrid = (gridDate: TZDate) => {
  return (uiModel: EventUIModel) => {
    const eventStart = toStartOfDay(uiModel.getStarts());
    const eventEnd = toStartOfDay(uiModel.getEnds());

    return eventStart <= gridDate && gridDate <= eventEnd;
  };
};

/**
 * 获取日期在行中的索引位置
 *
 * @param date 目标日期
 * @param row 日期数组
 * @returns 日期在数组中的索引，如果未找到返回-1
 */
export function getGridDateIndex(date: TZDate, row: TZDate[]) {
  return row.findIndex((cell) => date >= toStartOfDay(cell) && date <= toEndOfDay(cell));
}

/**
 * 根据起始和结束索引计算左边距和宽度
 *
 * @param startIndex 起始索引
 * @param endIndex 结束索引
 * @param row 日期数组
 * @param narrowWeekend 是否缩窄周末显示
 * @returns 包含左边距和宽度的对象
 */
export const getLeftAndWidth = (
  startIndex: number,
  endIndex: number,
  row: TZDate[],
  narrowWeekend: boolean
) => {
  const { widthList } = getGridWidthAndLeftPercentValues(row, narrowWeekend, TOTAL_WIDTH);

  return {
    left: !startIndex ? 0 : getWidth(widthList, 0, startIndex - 1),
    width: getWidth(widthList, startIndex ?? 0, endIndex < 0 ? row.length - 1 : endIndex),
  };
};

/**
 * 根据事件的开始和结束时间计算左边距和宽度
 *
 * @param start 事件开始时间
 * @param end 事件结束时间
 * @param row 日期数组
 * @param narrowWeekend 是否缩窄周末显示
 * @returns 包含宽度和左边距的对象
 */
export const getEventLeftAndWidth = (
  start: TZDate,
  end: TZDate,
  row: TZDate[],
  narrowWeekend: boolean
) => {
  const { widthList } = getGridWidthAndLeftPercentValues(row, narrowWeekend, TOTAL_WIDTH);

  let gridStartIndex = 0;
  let gridEndIndex = row.length - 1;

  row.forEach((cell, index) => {
    if (cell <= start) {
      gridStartIndex = index;
    }
    if (cell <= end) {
      gridEndIndex = index;
    }
  });

  return {
    width: getWidth(widthList, gridStartIndex, gridEndIndex),
    left: !gridStartIndex ? 0 : getWidth(widthList, 0, gridStartIndex - 1),
  };
};

/**
 * 为事件UI模型添加位置信息
 *
 * @param uiModel 事件UI模型
 * @param row 日期数组
 * @param narrowWeekend 是否缩窄周末显示
 * @returns 添加了位置信息的事件UI模型
 */
function getEventUIModelWithPosition(
  uiModel: EventUIModel,
  row: TZDate[],
  narrowWeekend = false
): EventUIModel {
  const modelStart = uiModel.getStarts();
  const modelEnd = uiModel.getEnds();
  const { width, left } = getEventLeftAndWidth(modelStart, modelEnd, row, narrowWeekend);

  uiModel.width = width;
  uiModel.left = left;

  return uiModel;
}

/**
 * 获取渲染的事件UI模型
 * 根据日历数据和日期范围获取事件，并计算其位置信息
 *
 * @param row 日期数组
 * @param calendarData 日历数据
 * @param narrowWeekend 是否缩窄周末显示
 * @returns 包含UI模型和网格日期事件映射的对象
 */
export function getRenderedEventUIModels(
  row: TZDate[],
  calendarData: CalendarData,
  narrowWeekend: boolean
) {
  const { idsOfDay } = calendarData;
  const eventUIModels = findByDateRange(calendarData, {
    start: row[0],
    end: toEndOfDay(row[row.length - 1]),
  });
  const idEventModelMap: Record<number, EventUIModel> = [];

  forEachMatrix3d(eventUIModels, (uiModel) => {
    const cid = uiModel.model.cid();
    idEventModelMap[cid] = getEventUIModelWithPosition(uiModel, row, narrowWeekend);
  });

  const gridDateEventModelMap = Object.keys(idsOfDay).reduce<Record<string, EventUIModel[]>>(
    (acc, ymd) => {
      const ids = idsOfDay[ymd];

      acc[ymd] = ids.map((cid) => idEventModelMap[cid]).filter((vm) => !!vm);

      return acc;
    },
    {}
  );

  return {
    uiModels: Object.values(idEventModelMap),
    gridDateEventModelMap,
  };
}

/**
 * 处理日网格事件模型，添加位置信息
 *
 * @param eventModels 日网格事件矩阵
 * @param row 日期数组
 * @param narrowWeekend 是否缩窄周末显示
 * @returns 处理后的事件UI模型数组
 */
/**
 * 处理日网格事件模型，为每个事件计算位置和尺寸信息
 * 遍历三维事件矩阵，为每个事件UI模型添加宽度、左边距和顶部位置
 *
 * @param eventModels 日网格事件矩阵 - 三维数组结构，包含所有日期网格事件
 * @param row 日期数组 - 当前显示的日期行，用于计算事件位置
 * @param narrowWeekend 是否缩窄周末显示 - 影响事件宽度计算
 * @returns 处理后的扁平化事件UI模型数组
 */
const getDayGridEventModels = (
  eventModels: DayGridEventMatrix,
  row: TZDate[],
  narrowWeekend = false
): EventUIModel[] => {
  // 遍历三维矩阵中的每个事件UI模型
  // 为每个事件计算并设置位置和尺寸属性
  forEachMatrix3d(eventModels, (uiModel) => {
    // 获取事件的开始和结束时间
    const modelStart = uiModel.getStarts();
    const modelEnd = uiModel.getEnds();

    // 根据事件的时间范围和日期行计算事件的宽度和左边距
    // 考虑周末缩窄选项对布局的影响
    const { width, left } = getEventLeftAndWidth(modelStart, modelEnd, row, narrowWeekend);

    // 设置事件UI模型的显示属性
    uiModel.width = width; // 事件宽度（百分比）
    uiModel.left = left; // 事件左边距（百分比）
    uiModel.top += 1; // 调整顶部位置，避免重叠
  });

  // 将三维矩阵扁平化为一维数组返回
  return flattenMatrix3d(eventModels);
};

/**
 * 过滤有效的模型
 * 移除数组中的空值、null 或 undefined 元素
 *
 * @param models 事件UI模型数组
 * @returns 过滤后的有效模型数组
 */
const getModels = (models: EventUIModel[]) => models.filter((model) => !!model);

/**
 * 将三维矩阵扁平化为一维数组
 * 将嵌套的三维事件矩阵结构转换为扁平的一维数组
 * 结构：matrices[matrix][row][models] -> EventUIModel[]
 *
 * @param matrices 三维事件矩阵 - 包含多个二维矩阵，每个矩阵包含多行，每行包含多个事件模型
 * @returns 扁平化后的事件UI模型数组
 */
function flattenMatrix3d(matrices: DayGridEventMatrix): EventUIModel[] {
  // 使用 flatMap 进行两层扁平化：
  // 1. 第一层：将三维矩阵扁平化为二维数组
  // 2. 第二层：将二维数组扁平化为一维数组，同时过滤无效模型
  return matrices.flatMap((matrix) => matrix.flatMap((models) => getModels(models)));
}

// TODO: 检查当 `narrowWeekend` 选项为 true 时是否正常工作
/**
 * 获取时间网格事件模型
 * 从时间网格事件矩阵中提取唯一的事件UI模型
 * 由于时间网格中不同行可能包含相同的事件UI模型，需要去重处理
 *
 * @param eventMatrix 时间网格事件矩阵 - 按时间段组织的三维事件矩阵
 * @returns 去重后的唯一事件UI模型数组
 */
const getTimeGridEventModels = (eventMatrix: TimeGridEventMatrix): EventUIModel[] => {
  // 注意：不同行中有相同的UI模型，所以需要获取唯一的UI模型

  // 1. 获取事件矩阵的所有值（三维矩阵数组）
  // 2. 使用 reduce 将所有三维矩阵扁平化并合并为一个数组
  // 3. 使用 Set 进行去重（基于对象引用）
  // 4. 转换回数组格式
  return Array.from(
    new Set(
      Object.values(eventMatrix).reduce<EventUIModel[]>(
        (result, matrix3d) => result.concat(...flattenMatrix3d(matrix3d)),
        []
      )
    )
  );
};

/**
 * 获取周视图事件
 * 根据周选项和日期范围获取各种类型的事件，并按照面板类型进行分类处理
 *
 * @param row 日期数组 - 当前周视图显示的日期行（通常是7天或5天工作日）
 * @param calendarData 日历数据 - 包含所有事件数据的日历对象
 * @param options 周视图选项和日期范围
 * @param options.narrowWeekend 是否缩窄周末显示
 * @param options.hourStart 时间网格的开始小时
 * @param options.hourEnd 时间网格的结束小时
 * @param options.weekStartDate 周开始日期
 * @param options.weekEndDate 周结束日期
 * @returns 事件模型映射 - 按事件类型分类的事件UI模型数组
 */
export const getWeekViewEvents = (
  row: TZDate[],
  calendarData: CalendarData,
  {
    narrowWeekend,
    hourStart,
    hourEnd,
    weekStartDate,
    weekEndDate,
  }: WeekOptions & {
    weekStartDate: TZDate;
    weekEndDate: TZDate;
  }
): EventModelMap => {
  // 定义周视图的面板配置
  // 每个面板代表一种事件类型，用于在周视图中分类显示事件
  const panels: Panel[] = [
    {
      name: 'milestone', // 里程碑事件 - 在日期网格中显示
      type: 'daygrid', // 使用日期网格布局
      show: true, // 显示此面板
    },
    {
      name: 'task', // 任务事件 - 在日期网格中显示
      type: 'daygrid', // 使用日期网格布局
      show: true, // 显示此面板
    },
    {
      name: 'allday', // 全天事件 - 在日期网格中显示
      type: 'daygrid', // 使用日期网格布局
      show: true, // 显示此面板
    },
    {
      name: 'time', // 时间事件 - 在时间网格中显示
      type: 'timegrid', // 使用时间网格布局
      show: true, // 显示此面板
    },
  ];

  // 根据日期范围和面板配置查找事件
  // 使用周视图专用的事件查找函数，支持面板过滤和时间范围限制
  const eventModels = findByDateRangeForWeek(calendarData, {
    start: weekStartDate, // 周开始日期
    end: weekEndDate, // 周结束日期
    panels, // 面板配置，用于过滤事件类型
    andFilters: [], // 额外的过滤条件（当前为空）
    options: {
      hourStart, // 时间网格开始小时
      hourEnd, // 时间网格结束小时
    },
  });

  // 处理查找到的事件，按面板类型进行分类和转换
  // 使用 reduce 方法遍历所有事件类型，将原始事件数据转换为UI模型
  return Object.keys(eventModels).reduce<EventModelMap>(
    (acc, cur) => {
      // 获取当前面板类型的事件数据
      const events = eventModels[cur as keyof EventModelMap];

      // 根据事件类型进行不同的处理：
      // - 如果是数组（daygrid类型）：使用 getDayGridEventModels 处理日期网格事件
      // - 如果不是数组（timegrid类型）：使用 getTimeGridEventModels 处理时间网格事件
      return {
        ...acc, // 保留已处理的事件
        [cur]: Array.isArray(events)
          ? getDayGridEventModels(events, row, narrowWeekend) // 日期网格事件：需要计算位置和宽度
          : getTimeGridEventModels(events), // 时间网格事件：只需要去重
      };
    },
    // 初始值：为每种事件类型提供空数组
    {
      milestone: [], // 里程碑事件数组
      allday: [], // 全天事件数组
      task: [], // 任务事件数组
      time: [], // 时间事件数组
    }
  );
};

/**
 * 创建月视图的日期矩阵
 * 根据渲染目标日期和月视图选项生成日期矩阵
 *
 * @param renderTargetDate 渲染目标日期
 * @param options 月视图选项
 * @param options.workweek 是否为工作周模式
 * @param options.visibleWeeksCount 可见周数
 * @param options.startDayOfWeek 一周的起始日
 * @param options.isAlways6Weeks 是否总是显示6周
 * @returns 日期矩阵（二维数组）
 */
export function createDateMatrixOfMonth(
  renderTargetDate: Date | TZDate,
  {
    workweek = false,
    visibleWeeksCount = 0,
    startDayOfWeek = 0,
    isAlways6Weeks = true,
  }: MonthOptions
) {
  const targetDate = new TZDate(renderTargetDate);
  const shouldApplyVisibleWeeksCount = visibleWeeksCount > 0;
  const baseDate = shouldApplyVisibleWeeksCount ? targetDate : toStartOfMonth(targetDate);
  const firstDateOfMatrix = subtractDate(
    baseDate,
    baseDate.getDay() - startDayOfWeek + (baseDate.getDay() < startDayOfWeek ? WEEK_DAYS : 0)
  );
  const dayOfFirstDateOfMatrix = firstDateOfMatrix.getDay();

  const totalDatesCountOfMonth = toEndOfMonth(targetDate).getDate();
  const initialDifference = getDateDifference(firstDateOfMatrix, baseDate);
  const totalDatesOfMatrix = totalDatesCountOfMonth + Math.abs(initialDifference);

  let totalWeeksOfMatrix = DEFAULT_VISIBLE_WEEKS;
  if (shouldApplyVisibleWeeksCount) {
    totalWeeksOfMatrix = visibleWeeksCount;
  } else if (isAlways6Weeks === false) {
    totalWeeksOfMatrix = Math.ceil(totalDatesOfMatrix / WEEK_DAYS);
  }

  return range(0, totalWeeksOfMatrix).map((weekIndex) =>
    range(0, WEEK_DAYS).reduce((weekRow, dayOfWeek) => {
      const steps = weekIndex * WEEK_DAYS + dayOfWeek;
      const currentDay = (steps + dayOfFirstDateOfMatrix) % WEEK_DAYS;
      if (!workweek || (workweek && !isWeekend(currentDay))) {
        const date = addDate(firstDateOfMatrix, steps);
        weekRow.push(date);
      }

      return weekRow;
    }, [] as TZDate[])
  );
}

/**
 * 获取指定日期所在周的日期数组
 *
 * 该函数根据给定的渲染日期和配置选项，计算并返回该周的所有日期。
 * 支持自定义一周的起始日和工作日模式，可以过滤掉周末日期。
 *
 * @param renderDate - 渲染的目标日期，用于确定要获取哪一周的日期
 * @param options - 配置选项
 * @param options.startDayOfWeek - 一周的起始日，默认为周日 (Day.SUN = 0)
 * @param options.workweek - 是否为工作日模式，true时只返回工作日（周一到周五）
 * @returns 返回该周的日期数组，每个元素为 TZDate 对象
 *
 * @example
 * // 获取以周一为起始日的工作周日期
 * getWeekDates(new TZDate('2024-01-15'), { startDayOfWeek: Day.MON, workweek: true })
 * // 返回: [周一, 周二, 周三, 周四, 周五] (5个工作日)
 *
 * @example
 * // 获取以周日为起始日的完整周日期
 * getWeekDates(new TZDate('2024-01-15'), { startDayOfWeek: Day.SUN, workweek: false })
 * // 返回: [周日, 周一, 周二, 周三, 周四, 周五, 周六] (7天)
 */
export function getWeekDates(
  renderDate: TZDate,
  { startDayOfWeek = Day.SUN, workweek }: WeekOptions
): TZDate[] {
  // 将渲染日期标准化到当天的开始时间（00:00:00）
  const now = toStartOfDay(renderDate);

  // 获取当前日期是周几（0=周日，1=周一，...，6=周六）
  const nowDay = now.getDay();

  // 计算需要向前偏移的天数，以对齐到指定的起始日
  // 例如：如果当前是周三(3)，起始日是周一(1)，则需要向前偏移2天
  const prevDateCount = nowDay - startDayOfWeek;

  // 生成一周的日期偏移数组
  // 根据偏移天数的正负情况，生成不同的范围：
  // - 如果 prevDateCount >= 0：从 -prevDateCount 到 (7 - prevDateCount)
  // - 如果 prevDateCount < 0：从 -(7 + prevDateCount) 到 -prevDateCount
  const weekDayList =
    prevDateCount >= 0
      ? range(-prevDateCount, WEEK_DAYS - prevDateCount)
      : range(-WEEK_DAYS - prevDateCount, -prevDateCount);

  // 将偏移数组转换为实际的日期数组
  return weekDayList.reduce<TZDate[]>((acc, day) => {
    // 根据偏移天数计算实际日期
    const date = addDate(now, day);

    // 如果是工作日模式且当前日期是周末，则跳过该日期
    if (workweek && isWeekend(date.getDay())) {
      return acc;
    }

    // 将日期添加到结果数组中
    acc.push(date);

    return acc;
  }, []);
}

/**
 * 获取网格列数据
 * 计算日历网格中每列的宽度和位置信息
 *
 * @param datesOfWeek 一周的日期数组 (通常是5天或7天)
 * @param narrowWeekend 是否缩窄周末显示，默认为false
 * @returns 包含每列日期、宽度和左边距的数组
 */
// @TODO: replace `getRowStyleInfo` to this function
export function getColumnsData(
  datesOfWeek: TZDate[], // 5 or 7 dates
  narrowWeekend = false
): CommonGridColumn[] {
  // 获取日期数量
  const datesCount = datesOfWeek.length;

  // 是否应用周末缩窄：当日期数量大于5且启用了周末缩窄时
  const shouldApplyNarrowWeekend = datesCount > 5 && narrowWeekend;

  // 计算默认列宽度（百分比）
  // 如果启用周末缩窄，分母减1是因为周末列会占用一半宽度
  const defaultWidthByColumns = shouldApplyNarrowWeekend
    ? 100 / (datesCount - 1)
    : 100 / datesCount;

  return datesOfWeek
    .map((date) => {
      // 计算每列的宽度
      // 如果启用周末缩窄且当前日期是周末，则宽度为默认宽度的一半
      const width =
        shouldApplyNarrowWeekend && isWeekend(date.getDay())
          ? defaultWidthByColumns / 2
          : defaultWidthByColumns;

      return {
        date,
        width,
      };
    })
    .reduce<CommonGridColumn[]>((result, currentDateAndWidth, index) => {
      // 获取前一列的信息
      const prev = result[index - 1];

      // 计算当前列的左边距
      // 第一列左边距为0，其他列的左边距 = 前一列的左边距 + 前一列的宽度
      result.push({
        ...currentDateAndWidth,
        left: index === 0 ? 0 : prev.left + prev.width,
      });

      return result;
    }, []);
}

/**
 * 创建时间网格数据
 * 生成周视图或日视图的时间网格结构，包含列（日期）和行（时间段）信息
 *
 * @param datesOfWeek 一周的日期数组
 * @param options 配置选项
 * @param options.hourStart 开始小时 (如：9表示上午9点)
 * @param options.hourEnd 结束小时 (如：18表示下午6点)
 * @param options.narrowWeekend 是否缩窄周末显示，可选
 * @returns 时间网格数据，包含列和行信息
 */
export function createTimeGridData(
  datesOfWeek: TZDate[],
  options: {
    hourStart: number;
    hourEnd: number;
    narrowWeekend?: boolean;
  }
): TimeGridData {
  // 获取列数据（日期列）
  const columns = getColumnsData(datesOfWeek, options.narrowWeekend ?? false);

  // 计算时间步数：每小时分为2个30分钟时间段
  const steps = (options.hourEnd - options.hourStart) * 2;

  // 计算每行的基础高度（百分比）
  const baseHeight = 100 / steps;

  // 生成时间行数据
  const rows = range(steps).map((step, index) => {
    // 判断是否为奇数索引（表示30分钟时间段）
    const isOdd = index % 2 === 1;

    // 计算当前小时
    const hour = options.hourStart + Math.floor(step / 2);

    // 生成开始时间字符串（格式：HH:MM）
    const startTime = `${hour}:${isOdd ? '30' : '00'}`.padStart(5, '0') as FormattedTimeString;

    // 生成结束时间字符串（格式：HH:MM）
    const endTime = (isOdd ? `${hour + 1}:00` : `${hour}:30`).padStart(
      5,
      '0'
    ) as FormattedTimeString;

    return {
      top: baseHeight * index, // 行的顶部位置（百分比）
      height: baseHeight, // 行的高度（百分比）
      startTime, // 时间段开始时间
      endTime, // 时间段结束时间
    };
  });

  return {
    columns, // 列数据（日期信息）
    rows, // 行数据（时间段信息）
  };
}

/**
 * 容器位置信息接口
 */
interface ContainerPosition {
  left: number; // 容器左边距
  top: number; // 容器上边距
  clientLeft: number; // 客户端左边距
  clientTop: number; // 客户端上边距
}

/**
 * 获取相对于容器的鼠标位置
 * @param clientX 鼠标客户端X坐标
 * @param clientY 鼠标客户端Y坐标
 * @param left 容器左边距
 * @param top 容器上边距
 * @param clientLeft 客户端左边距
 * @param clientTop 客户端上边距
 * @returns 相对位置坐标 [x, y]
 */
function getRelativeMousePosition(
  { clientX, clientY }: ClientMousePosition,
  { left, top, clientLeft, clientTop }: ContainerPosition
) {
  return [clientX - left - clientLeft, clientY - top - clientTop];
}

/**
 * 根据位置计算索引
 * @param arrayLength 数组长度
 * @param maxRange 最大范围
 * @param currentPosition 当前位置
 * @returns 计算得出的索引，限制在有效范围内
 */
function getIndexFromPosition(arrayLength: number, maxRange: number, currentPosition: number) {
  const calculatedIndex = Math.floor(ratio(maxRange, arrayLength, currentPosition));

  return limit(calculatedIndex, [0], [arrayLength - 1]);
}

/**
 * 创建网格位置查找器
 * 用于根据鼠标位置确定在日历网格中的行列索引
 *
 * @param rowsCount 网格行数
 * @param columnsCount 网格列数
 * @param container 容器DOM元素
 * @param narrowWeekend 是否缩窄周末显示
 * @param startDayOfWeek 一周开始的日期（0=周日，1=周一...）
 * @returns GridPositionFinder 网格位置查找函数
 */
export function createGridPositionFinder({
  rowsCount,
  columnsCount,
  container,
  narrowWeekend = false,
  startDayOfWeek = Day.SUN,
}: {
  rowsCount: number;
  columnsCount: number;
  container: HTMLElement | null;
  narrowWeekend?: boolean;
  startDayOfWeek?: Day;
}): GridPositionFinder {
  // 如果容器不存在，返回始终返回null的函数
  if (isNil(container)) {
    return (() => null) as GridPositionFinder;
  }

  // 生成从起始日期开始的连续天数范围，并转换为星期几（0-6）
  const dayRange = range(startDayOfWeek, startDayOfWeek + columnsCount).map(
    (day) => day % WEEK_DAYS
  );

  // 如果启用了周末缩窄，计算周末天数
  const narrowColumnCount = narrowWeekend ? dayRange.filter((day) => isWeekend(day)).length : 0;

  /**
   * 网格位置查找函数
   * @param mousePosition 鼠标位置
   * @returns 网格位置信息（行列索引）或null
   */
  return function gridPositionFinder(mousePosition) {
    // 获取容器的位置和尺寸信息
    const {
      left: containerLeft,
      top: containerTop,
      width: containerWidth,
      height: containerHeight,
    } = container.getBoundingClientRect();

    // 计算鼠标相对于容器的位置
    const [left, top] = getRelativeMousePosition(mousePosition, {
      left: containerLeft,
      top: containerTop,
      clientLeft: container.clientLeft,
      clientTop: container.clientTop,
    });

    // 检查鼠标是否在容器范围内
    if (left < 0 || top < 0 || left > containerWidth || top > containerHeight) {
      return null;
    }

    // 计算单位宽度
    // 如果启用周末缩窄：总宽度除以(总列数 - 周末列数 + 1)
    // 否则：总宽度除以总列数
    const unitWidth = narrowWeekend
      ? containerWidth / (columnsCount - narrowColumnCount + 1)
      : containerWidth / columnsCount;

    // 计算每列的宽度列表
    // 如果启用周末缩窄且该天是周末，则宽度为单位宽度的一半
    const columnWidthList = dayRange.map((dayOfWeek) =>
      narrowWeekend && isWeekend(dayOfWeek) ? unitWidth / 2 : unitWidth
    );

    // 计算每列的左边距位置列表
    const columnLeftList: number[] = [];
    columnWidthList.forEach((width, index) => {
      if (index === 0) {
        columnLeftList.push(0); // 第一列左边距为0
      } else {
        // 后续列的左边距 = 前一列的左边距 + 前一列的宽度
        columnLeftList.push(columnLeftList[index - 1] + columnWidthList[index - 1]);
      }
    });

    // 查找鼠标位置对应的列索引
    // 找到最后一个左边距小于等于鼠标X位置的列
    const columnIndex = findLastIndex(columnLeftList, (columnLeft) => left >= columnLeft);

    return {
      columnIndex, // 列索引
      rowIndex: getIndexFromPosition(rowsCount, containerHeight, top), // 行索引
    };
  };
}
