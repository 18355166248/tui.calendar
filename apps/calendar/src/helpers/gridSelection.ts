/**
 * 网格选择辅助工具模块
 * 提供不同视图类型（时间网格、月视图、全天行）的网格选择计算功能
 */

import type { useGridSelection } from '@src/hooks/gridSelection/useGridSelection';
import type TZDate from '@src/time/date';
import { setTimeStrToDate } from '@src/time/datetime';
import { isBetween, isBetween as isBetweenValue } from '@src/utils/math';
import { isNil, isPresent } from '@src/utils/type';

import type {
  GridSelectionData,
  GridSelectionDataByRow,
  TimeGridSelectionDataByCol,
} from '@t/components/gridSelection';
import type { GridPosition, TimeGridData } from '@t/grid';

/**
 * 网格选择钩子必需参数类型
 * 从 useGridSelection 钩子中提取必需的选择排序器和日期获取器
 */
type RequiredGridSelectionHookParams = Pick<
  Parameters<typeof useGridSelection>[0],
  'selectionSorter' | 'dateGetter'
>;

/**
 * 网格选择辅助工具类型
 * 定义通用的网格选择辅助工具接口，包含排序、日期获取和选择计算功能
 */
type GridSelectionHelper<
  SelectionCalculator extends (
    gridSelection: GridSelectionData | null,
    ...rest: any[]
  ) => (TimeGridSelectionDataByCol | null) | (GridSelectionDataByRow | null)
> = {
  sortSelection: RequiredGridSelectionHookParams['selectionSorter'];
  getDateFromCollection: RequiredGridSelectionHookParams['dateGetter'];
  calculateSelection: SelectionCalculator;
};

/**
 * 创建排序后的网格选择数据
 * 根据初始位置和当前位置，确定选择区域的起始和结束索引
 *
 * @param initPos - 初始选择位置
 * @param currentPos - 当前选择位置
 * @param isReversed - 是否反向选择（从右到左或从下到上）
 * @returns 排序后的网格选择数据
 */
function createSortedGridSelection(
  initPos: GridPosition,
  currentPos: GridPosition,
  isReversed: boolean
) {
  return {
    startColumnIndex: isReversed ? currentPos.columnIndex : initPos.columnIndex,
    startRowIndex: isReversed ? currentPos.rowIndex : initPos.rowIndex,
    endColumnIndex: isReversed ? initPos.columnIndex : currentPos.columnIndex,
    endRowIndex: isReversed ? initPos.rowIndex : currentPos.rowIndex,
  };
}

/**
 * 根据当前列索引计算时间网格选择数据
 * 用于时间视图中的网格选择，处理跨列选择的情况
 *
 * @param timeGridSelection - 时间网格选择数据
 * @param columnIndex - 当前列索引
 * @param maxRowIndex - 最大行索引（时间网格数据的最后一行索引）
 * @returns 当前列的选择数据，如果不在选择范围内则返回 null
 */
function calculateTimeGridSelectionByCurrentIndex(
  timeGridSelection: GridSelectionData | null,
  columnIndex: number,
  maxRowIndex: number // maxRowIndex is the last row index of the `timeGridData.row`
) {
  if (isNil(timeGridSelection)) {
    return null;
  }

  const { startColumnIndex, endColumnIndex, endRowIndex, startRowIndex } = timeGridSelection;

  // 检查当前列是否在选择范围内
  if (!isBetweenValue(columnIndex, startColumnIndex, endColumnIndex)) {
    return null;
  }

  const hasMultipleColumns = startColumnIndex !== endColumnIndex;
  const isStartingColumn = columnIndex === startColumnIndex;
  const resultGridSelection: TimeGridSelectionDataByCol = {
    startRowIndex,
    endRowIndex,
    isSelectingMultipleColumns: hasMultipleColumns,
    isStartingColumn,
  };

  // 处理跨列选择的特殊情况
  if (startColumnIndex < columnIndex && columnIndex < endColumnIndex) {
    // 中间列：选择整列
    resultGridSelection.startRowIndex = 0;
    resultGridSelection.endRowIndex = maxRowIndex;
  } else if (startColumnIndex !== endColumnIndex) {
    if (startColumnIndex === columnIndex) {
      // 起始列：从起始行到末尾
      resultGridSelection.endRowIndex = maxRowIndex;
    } else if (endColumnIndex === columnIndex) {
      // 结束列：从开始到结束行
      resultGridSelection.startRowIndex = 0;
    }
  }

  return resultGridSelection;
}

/**
 * 时间网格选择辅助工具
 * 提供时间视图的网格选择功能，包括排序、日期获取和选择计算
 */
export const timeGridSelectionHelper: GridSelectionHelper<
  typeof calculateTimeGridSelectionByCurrentIndex
> = {
  /**
   * 排序选择区域
   * 根据初始位置和当前位置确定选择方向，确保起始索引小于结束索引
   */
  sortSelection: (initPos, currentPos) => {
    const isReversed =
      initPos.columnIndex > currentPos.columnIndex ||
      (initPos.columnIndex === currentPos.columnIndex && initPos.rowIndex > currentPos.rowIndex);

    return createSortedGridSelection(initPos, currentPos, isReversed);
  },
  /**
   * 从时间网格数据中获取选择区域的日期范围
   * 将网格索引转换为实际的开始和结束日期
   */
  getDateFromCollection: (dateCollection, gridSelection) => {
    const timeGridData = dateCollection as TimeGridData;

    const startDate = setTimeStrToDate(
      timeGridData.columns[gridSelection.startColumnIndex].date,
      timeGridData.rows[gridSelection.startRowIndex].startTime
    );
    const endDate = setTimeStrToDate(
      timeGridData.columns[gridSelection.endColumnIndex].date,
      timeGridData.rows[gridSelection.endRowIndex].endTime
    );

    return [startDate, endDate];
  },
  calculateSelection: calculateTimeGridSelectionByCurrentIndex,
};

/**
 * 根据当前行索引计算月视图网格选择数据
 * 用于月视图中的网格选择，处理跨行选择的情况
 *
 * @param gridSelection - 网格选择数据
 * @param currentIndex - 当前行索引
 * @param weekLength - 一周的天数（通常是7）
 * @returns 当前行的选择数据，如果不在选择范围内则返回 null
 */
function calculateDayGridMonthSelectionByCurrentIndex(
  gridSelection: GridSelectionData | null,
  currentIndex: number,
  weekLength: number
) {
  if (!(isPresent(gridSelection) && isPresent(currentIndex) && isPresent(weekLength))) {
    return null;
  }

  const { startRowIndex, startColumnIndex, endRowIndex, endColumnIndex } = gridSelection;

  // 检查当前行是否在选择范围内
  if (
    !isBetween(
      currentIndex,
      Math.min(startRowIndex, endRowIndex),
      Math.max(startRowIndex, endRowIndex)
    )
  ) {
    return null;
  }

  let startCellIndex = startColumnIndex;
  let endCellIndex = endColumnIndex;

  // 处理跨行选择的特殊情况
  if (startRowIndex < currentIndex) {
    // 当前行在起始行之后：从行首开始选择
    startCellIndex = 0;
  }

  if (endRowIndex > currentIndex) {
    // 当前行在结束行之前：选择到行尾
    endCellIndex = weekLength - 1;
  }

  return { startCellIndex, endCellIndex };
}

/**
 * 月视图网格选择辅助工具
 * 提供月视图的网格选择功能，包括排序、日期获取和选择计算
 */
export const dayGridMonthSelectionHelper: GridSelectionHelper<
  typeof calculateDayGridMonthSelectionByCurrentIndex
> = {
  /**
   * 排序选择区域
   * 优先按行排序，同行内按列排序
   */
  sortSelection: (initPos, currentPos) => {
    const isReversed =
      initPos.rowIndex > currentPos.rowIndex ||
      (initPos.rowIndex === currentPos.rowIndex && initPos.columnIndex > currentPos.columnIndex);

    return createSortedGridSelection(initPos, currentPos, isReversed);
  },
  /**
   * 从日期矩阵中获取选择区域的日期范围
   * 将网格索引转换为实际的开始和结束日期
   */
  getDateFromCollection: (dateCollection, gridSelection) => {
    const dateMatrix = dateCollection as TZDate[][];

    return [
      dateMatrix[gridSelection.startRowIndex][gridSelection.startColumnIndex],
      dateMatrix[gridSelection.endRowIndex][gridSelection.endColumnIndex],
    ];
  },
  calculateSelection: calculateDayGridMonthSelectionByCurrentIndex,
};

/**
 * 计算全天行网格选择数据
 * 用于周视图中的全天事件行选择
 *
 * @param gridSelection - 网格选择数据
 * @returns 全天行的选择数据，如果没有选择则返回 null
 */
function calculateAlldayGridRowSelectionByCurrentIndex(gridSelection: GridSelectionData | null) {
  return isPresent(gridSelection)
    ? {
        startCellIndex: gridSelection.startColumnIndex,
        endCellIndex: gridSelection.endColumnIndex,
      }
    : null;
}

/**
 * 全天行网格选择辅助工具
 * 提供全天行的网格选择功能，包括排序、日期获取和选择计算
 */
export const alldayGridRowSelectionHelper: GridSelectionHelper<
  typeof calculateAlldayGridRowSelectionByCurrentIndex
> = {
  /**
   * 排序选择区域
   * 只按列排序，因为全天行只有一行
   */
  sortSelection: (initPos, currentPos) => {
    const isReversed = initPos.columnIndex > currentPos.columnIndex;

    return createSortedGridSelection(initPos, currentPos, isReversed);
  },
  /**
   * 从周日期数组中获取选择区域的日期范围
   * 将列索引转换为实际的开始和结束日期
   */
  getDateFromCollection: (dateCollection, gridSelection) => {
    const weekDates = dateCollection as TZDate[];

    return [weekDates[gridSelection.startColumnIndex], weekDates[gridSelection.endColumnIndex]];
  },
  calculateSelection: calculateAlldayGridRowSelectionByCurrentIndex,
};
