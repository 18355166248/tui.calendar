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

export const EVENT_HEIGHT = 22;
export const TOTAL_WIDTH = 100;

function forEachMatrix3d<T>(matrices: Matrix3d<T>, iteratee: (target: T, index?: number) => void) {
  matrices.forEach((matrix) => {
    matrix.forEach((row) => {
      row.forEach((value, index) => {
        iteratee(value, index);
      });
    });
  });
}

export function isWithinHeight(containerHeight: number, eventHeight: number) {
  return ({ top }: EventUIModel) => containerHeight >= top * eventHeight;
}

export function isExceededHeight(containerHeight: number, eventHeight: number) {
  return ({ top }: EventUIModel) => containerHeight < top * eventHeight;
}

export function getExceedCount(
  uiModel: EventUIModel[],
  containerHeight: number,
  eventHeight: number
) {
  return uiModel.filter(isExceededHeight(containerHeight, eventHeight)).length;
}

const getWeekendCount = (row: TZDate[]) => row.filter((cell) => isWeekend(cell.getDay())).length;

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

export function getWidth(widthList: number[], start: number, end: number) {
  return widthList.reduce((acc, width, index) => {
    if (start <= index && index <= end) {
      return acc + width;
    }

    return acc;
  }, 0);
}

export const isInGrid = (gridDate: TZDate) => {
  return (uiModel: EventUIModel) => {
    const eventStart = toStartOfDay(uiModel.getStarts());
    const eventEnd = toStartOfDay(uiModel.getEnds());

    return eventStart <= gridDate && gridDate <= eventEnd;
  };
};

export function getGridDateIndex(date: TZDate, row: TZDate[]) {
  return row.findIndex((cell) => date >= toStartOfDay(cell) && date <= toEndOfDay(cell));
}

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

const getDayGridEventModels = (
  eventModels: DayGridEventMatrix,
  row: TZDate[],
  narrowWeekend = false
): EventUIModel[] => {
  forEachMatrix3d(eventModels, (uiModel) => {
    const modelStart = uiModel.getStarts();
    const modelEnd = uiModel.getEnds();
    const { width, left } = getEventLeftAndWidth(modelStart, modelEnd, row, narrowWeekend);

    uiModel.width = width;
    uiModel.left = left;
    uiModel.top += 1;
  });

  return flattenMatrix3d(eventModels);
};

const getModels = (models: EventUIModel[]) => models.filter((model) => !!model);

function flattenMatrix3d(matrices: DayGridEventMatrix): EventUIModel[] {
  return matrices.flatMap((matrix) => matrix.flatMap((models) => getModels(models)));
}

// TODO: Check it works well when the `narrowWeekend` option is true
const getTimeGridEventModels = (eventMatrix: TimeGridEventMatrix): EventUIModel[] =>
  // NOTE: there are same ui models in different rows. so we need to get unique ui models.
  Array.from(
    new Set(
      Object.values(eventMatrix).reduce<EventUIModel[]>(
        (result, matrix3d) => result.concat(...flattenMatrix3d(matrix3d)),
        []
      )
    )
  );

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
  const panels: Panel[] = [
    {
      name: 'milestone',
      type: 'daygrid',
      show: true,
    },
    {
      name: 'task',
      type: 'daygrid',
      show: true,
    },
    {
      name: 'allday',
      type: 'daygrid',
      show: true,
    },
    {
      name: 'time',
      type: 'timegrid',
      show: true,
    },
  ];
  const eventModels = findByDateRangeForWeek(calendarData, {
    start: weekStartDate,
    end: weekEndDate,
    panels,
    andFilters: [],
    options: {
      hourStart,
      hourEnd,
    },
  });

  return Object.keys(eventModels).reduce<EventModelMap>(
    (acc, cur) => {
      const events = eventModels[cur as keyof EventModelMap];

      return {
        ...acc,
        [cur]: Array.isArray(events)
          ? getDayGridEventModels(events, row, narrowWeekend)
          : getTimeGridEventModels(events),
      };
    },
    {
      milestone: [],
      allday: [],
      task: [],
      time: [],
    }
  );
};

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

export function getWeekDates(
  renderDate: TZDate,
  { startDayOfWeek = Day.SUN, workweek }: WeekOptions
): TZDate[] {
  const now = toStartOfDay(renderDate);
  const nowDay = now.getDay();
  const prevDateCount = nowDay - startDayOfWeek;

  const weekDayList =
    prevDateCount >= 0
      ? range(-prevDateCount, WEEK_DAYS - prevDateCount)
      : range(-WEEK_DAYS - prevDateCount, -prevDateCount);

  return weekDayList.reduce<TZDate[]>((acc, day) => {
    const date = addDate(now, day);

    if (workweek && isWeekend(date.getDay())) {
      return acc;
    }
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
