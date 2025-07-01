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
 * 该函数的主要作用是：
 * 1. 判断当前列是否在用户选择的时间范围内
 * 2. 根据当前列在选择区域中的位置（起始列、中间列、结束列）计算该列的具体选择范围
 * 3. 处理跨列选择时的特殊逻辑，确保选择区域在视觉上连续且合理
 *
 * @param timeGridSelection - 时间网格选择数据，包含用户选择的起始和结束位置信息
 * @param columnIndex - 当前需要计算选择数据的列索引
 * @param maxRowIndex - 最大行索引（时间网格数据的最后一行索引），用于确定列的完整高度
 * @returns 当前列的选择数据，如果当前列不在选择范围内则返回 null
 */
function calculateTimeGridSelectionByCurrentIndex(
  timeGridSelection: GridSelectionData | null,
  columnIndex: number,
  maxRowIndex: number // maxRowIndex is the last row index of the `timeGridData.row`
) {
  // 如果没有选择数据，直接返回 null
  if (isNil(timeGridSelection)) {
    return null;
  }

  // 解构选择数据，获取选择区域的边界信息
  const { startColumnIndex, endColumnIndex, endRowIndex, startRowIndex } = timeGridSelection;

  // 检查当前列是否在选择范围内
  // 如果当前列索引不在起始列和结束列之间，则不在选择范围内
  if (!isBetweenValue(columnIndex, startColumnIndex, endColumnIndex)) {
    return null;
  }

  // 判断是否为多列选择（起始列和结束列不同）
  const hasMultipleColumns = startColumnIndex !== endColumnIndex;
  // 判断当前列是否为起始列
  const isStartingColumn = columnIndex === startColumnIndex;

  // 初始化结果对象，设置基本的选择信息
  const resultGridSelection: TimeGridSelectionDataByCol = {
    startRowIndex, // 起始行索引
    endRowIndex, // 结束行索引
    isSelectingMultipleColumns: hasMultipleColumns, // 是否选择了多列
    isStartingColumn, // 当前列是否为起始列
  };

  // 处理跨列选择的特殊情况
  if (startColumnIndex < columnIndex && columnIndex < endColumnIndex) {
    // 情况1：当前列是中间列（在起始列和结束列之间）
    // 中间列应该选择整列，从第一行到最后一行
    resultGridSelection.startRowIndex = 0;
    resultGridSelection.endRowIndex = maxRowIndex;
  } else if (startColumnIndex !== endColumnIndex) {
    // 情况2：多列选择但不是中间列
    if (startColumnIndex === columnIndex) {
      // 情况2a：当前列是起始列
      // 起始列从用户选择的起始行开始，到列的最后一行结束
      resultGridSelection.endRowIndex = maxRowIndex;
    } else if (endColumnIndex === columnIndex) {
      // 情况2b：当前列是结束列
      // 结束列从第一行开始，到用户选择的结束行结束
      resultGridSelection.startRowIndex = 0;
    }
  }
  // 情况3：单列选择（startColumnIndex === endColumnIndex）
  // 这种情况下，选择范围就是用户实际选择的行范围，不需要特殊处理

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
