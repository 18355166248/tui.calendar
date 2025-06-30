import { h } from 'preact';
import { useCallback, useMemo } from 'preact/hooks';

import { useStore } from '@src/contexts/calendarStore';
import { useTheme } from '@src/contexts/themeStore';
import { cls, toPercent } from '@src/helpers/css';
import { timeGridSelectionHelper } from '@src/helpers/gridSelection';
import { isNil } from '@src/utils/type';

import type { TimeGridRow } from '@t/grid';
import type { CalendarState } from '@t/store';

/**
 * 网格选择组件 - 显示时间网格中的选择区域
 * @param top - 选择区域的顶部位置
 * @param height - 选择区域的高度
 * @param text - 显示在选择区域上的文本（时间范围）
 */
function GridSelection({ top, height, text }: { top: number; height: number; text: string }) {
  // 获取主题中的网格选择样式
  const { backgroundColor, border } = useTheme(
    useCallback((theme) => theme.common.gridSelection, [])
  );
  // 获取周视图网格选择的文字颜色
  const color = useTheme(useCallback((theme) => theme.week.gridSelection.color, []));

  // 构建样式对象，将数值转换为百分比
  const style = {
    top: toPercent(top),
    height: toPercent(height),
    backgroundColor,
    border,
  };

  return (
    <div
      className={cls('time', 'grid-selection')}
      style={style}
      data-testid={`time-grid-selection-${top}-${height}`}
    >
      {/* 只有当文本不为空时才显示标签 */}
      {text.length > 0 ? (
        <span className={cls('grid-selection-label')} style={{ color }}>
          {text}
        </span>
      ) : null}
    </div>
  );
}

interface Props {
  columnIndex: number; // 列索引
  timeGridRows: TimeGridRow[]; // 时间网格行数据
}

/**
 * 按列显示网格选择组件
 * 根据当前列的选择状态计算并显示选择区域
 */
export function GridSelectionByColumn({ columnIndex, timeGridRows }: Props) {
  // 从store中获取网格选择数据，计算当前列的选择范围
  const gridSelectionData = useStore(
    useCallback(
      (state: CalendarState) =>
        timeGridSelectionHelper.calculateSelection(
          state.gridSelection.timeGrid, // 时间网格的选择状态
          columnIndex, // 当前列索引
          timeGridRows.length - 1 // 最大行索引
        ),
      [columnIndex, timeGridRows]
    )
  );

  // 根据选择数据计算选择组件的属性
  const gridSelectionProps = useMemo(() => {
    // 如果没有选择数据，返回null
    if (!gridSelectionData) {
      return null;
    }

    // 解构选择数据
    const { startRowIndex, endRowIndex, isStartingColumn, isSelectingMultipleColumns } =
      gridSelectionData;

    // 获取开始行的位置和开始时间
    const { top: startRowTop, startTime: startRowStartTime } = timeGridRows[startRowIndex];
    // 获取结束行的位置、高度和结束时间
    const {
      top: endRowTop,
      height: endRowHeight,
      endTime: endRowEndTime,
    } = timeGridRows[endRowIndex];

    // 计算选择区域的总高度
    const gridSelectionHeight = endRowTop + endRowHeight - startRowTop;

    // 构建显示的时间范围文本
    let text = `${startRowStartTime} - ${endRowEndTime}`;
    // 如果正在选择多列，只在起始列显示时间
    if (isSelectingMultipleColumns) {
      text = isStartingColumn ? startRowStartTime : '';
    }

    return {
      top: startRowTop,
      height: gridSelectionHeight,
      text,
    };
  }, [gridSelectionData, timeGridRows]);

  // 如果没有选择属性，不渲染任何内容
  if (isNil(gridSelectionProps)) {
    return null;
  }

  // 渲染网格选择组件
  return <GridSelection {...gridSelectionProps} />;
}
