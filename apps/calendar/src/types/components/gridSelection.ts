/**
 * 网格选择数据接口
 * 用于表示在日历网格中选择的矩形区域
 */
export interface GridSelectionData {
  /** 起始行索引 */
  startRowIndex: number;
  /** 起始列索引 */
  startColumnIndex: number;
  /** 结束行索引 */
  endRowIndex: number;
  /** 结束列索引 */
  endColumnIndex: number;
}

/**
 * 按行选择的网格数据接口
 * 用于表示在单行中选择的单元格范围
 */
export interface GridSelectionDataByRow {
  /** 起始单元格索引 */
  startCellIndex: number;
  /** 结束单元格索引 */
  endCellIndex: number;
}

/**
 * 时间网格按列选择数据接口
 * 用于表示在时间网格中按列选择的数据
 */
export interface TimeGridSelectionDataByCol {
  /** 起始行索引 */
  startRowIndex: number;
  /** 结束行索引 */
  endRowIndex: number;
  /** 是否为起始列 */
  isStartingColumn: boolean;
  /** 是否正在选择多列 */
  isSelectingMultipleColumns: boolean;
}
