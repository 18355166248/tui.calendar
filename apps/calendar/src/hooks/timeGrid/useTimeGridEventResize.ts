import type { ComponentProps } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

import type { ResizingGuideByColumn } from '@src/components/timeGrid/resizingGuideByColumn';
import { useEventBus } from '@src/contexts/eventBus';
import { useWhen } from '@src/hooks/common/useWhen';
import { useCurrentPointerPositionInGrid } from '@src/hooks/event/useCurrentPointerPositionInGrid';
import { useDraggingEvent } from '@src/hooks/event/useDraggingEvent';
import type EventUIModel from '@src/model/eventUIModel';
import type TZDate from '@src/time/date';
import { addMinutes, max, setTimeStrToDate } from '@src/time/datetime';
import { findLastIndex } from '@src/utils/array';
import { isNil, isPresent } from '@src/utils/type';

import type { TimeGridRow } from '@t/grid';

// 过滤后的UI模型行类型：空数组或包含一个EventUIModel的数组
type FilteredUIModelRow = [] | [EventUIModel];

/**
 * 时间网格事件调整大小的自定义Hook
 * 用于处理时间网格视图中事件的拖拽调整大小功能
 *
 * @param gridPositionFinder - 网格位置查找器，用于确定指针在网格中的位置
 * @param totalUIModels - 所有UI模型数据
 * @param columnIndex - 当前列索引
 * @param timeGridData - 时间网格数据
 * @returns 调整大小时的引导UI模型
 */
export function useTimeGridEventResize({
  gridPositionFinder,
  totalUIModels,
  columnIndex,
  timeGridData,
}: ComponentProps<typeof ResizingGuideByColumn>) {
  // 获取事件总线，用于触发事件更新
  const eventBus = useEventBus();

  // 使用拖拽事件Hook，专门处理时间网格的调整大小操作
  const {
    isDraggingEnd, // 是否正在结束拖拽
    isDraggingCanceled, // 是否取消拖拽
    draggingEvent: resizingStartUIModel, // 开始调整大小时的UI模型
    clearDraggingEvent, // 清除拖拽事件的函数
  } = useDraggingEvent('timeGrid', 'resize');

  // 获取当前指针在网格中的位置
  const [currentGridPos, clearCurrentGridPos] = useCurrentPointerPositionInGrid(gridPositionFinder);

  // 调整大小时的引导UI模型状态
  const [guideUIModel, setGuideUIModel] = useState<EventUIModel | null>(null);

  /**
   * 清除所有相关状态的函数
   * 在拖拽结束或取消时调用
   */
  const clearStates = useCallback(() => {
    setGuideUIModel(null);
    clearDraggingEvent();
    clearCurrentGridPos();
  }, [clearCurrentGridPos, clearDraggingEvent]);

  /**
   * 计算调整大小的基础信息
   * 包括事件的起始和结束位置、目标UI模型列等
   */
  const baseResizingInfo = useMemo(() => {
    // 如果没有开始调整大小的UI模型，返回null
    if (isNil(resizingStartUIModel)) {
      return null;
    }

    const { columns, rows } = timeGridData;

    /**
     * 过滤出由目标事件创建的UI模型
     * 遍历所有UI模型，只保留与当前调整大小事件ID相同的模型
     */
    const resizeTargetUIModelColumns = totalUIModels.map(
      (uiModels) =>
        uiModels.filter(
          (uiModel) => uiModel.cid() === resizingStartUIModel.cid()
        ) as FilteredUIModelRow
    );

    /**
     * 查找指定日期和列索引对应的行索引
     * @param targetDate - 目标日期
     * @param targetColumnIndex - 目标列索引
     * @returns 返回一个函数，用于判断行是否包含目标日期
     */
    const findRowIndexOf =
      (targetDate: TZDate, targetColumnIndex: number) => (row: TimeGridRow) => {
        // 计算行的开始和结束时间
        const rowStartTZDate = setTimeStrToDate(columns[targetColumnIndex].date, row.startTime);
        const rowEndTZDate = setTimeStrToDate(
          timeGridData.columns[targetColumnIndex].date,
          row.endTime
        );

        // 判断目标日期是否在当前行的时间范围内
        return rowStartTZDate <= targetDate && targetDate < rowEndTZDate;
      };

    // 找到事件开始日期的列索引（第一个包含该事件的列）
    const eventStartDateColumnIndex = resizeTargetUIModelColumns.findIndex((row) => row.length > 0);
    const resizingStartEventUIModel = resizeTargetUIModelColumns[
      eventStartDateColumnIndex
    ][0] as EventUIModel;

    // 获取事件的goingDuration（事件开始前的时间段）
    const { goingDuration = 0 } = resizingStartEventUIModel.model;
    // 计算渲染开始时间（考虑goingDuration）
    const renderStart = addMinutes(resizingStartEventUIModel.getStarts(), -goingDuration);

    // 找到事件开始日期的行索引
    const eventStartDateRowIndex = Math.max(
      rows.findIndex(findRowIndexOf(renderStart, eventStartDateColumnIndex)),
      0
    ); // 当返回-1时，表示事件在当前视图之前开始

    // 找到事件结束日期的列索引（最后一个包含该事件的列）
    const eventEndDateColumnIndex = findLastIndex(
      resizeTargetUIModelColumns,
      (row) => row.length > 0
    );
    const resizingEndEventUIModel = resizeTargetUIModelColumns[
      eventEndDateColumnIndex
    ][0] as EventUIModel;

    // 获取事件的comingDuration（事件结束后的时间段）
    const { comingDuration = 0 } = resizingEndEventUIModel.model;
    // 计算渲染结束时间（考虑comingDuration）
    const renderEnd = addMinutes(resizingEndEventUIModel.getStarts(), comingDuration);

    // 找到事件结束日期的行索引
    let eventEndDateRowIndex = rows.findIndex(findRowIndexOf(renderEnd, eventEndDateColumnIndex)); // 当返回-1时，表示事件在当前视图之后结束
    eventEndDateRowIndex = eventEndDateRowIndex >= 0 ? eventEndDateRowIndex : rows.length - 1;

    // 返回调整大小的基础信息
    return {
      eventStartDateColumnIndex, // 事件开始日期列索引
      eventStartDateRowIndex, // 事件开始日期行索引
      eventEndDateColumnIndex, // 事件结束日期列索引
      eventEndDateRowIndex, // 事件结束日期行索引
      resizeTargetUIModelColumns, // 调整大小的目标UI模型列
    };
  }, [resizingStartUIModel, timeGridData, totalUIModels]);

  /**
   * 判断是否可以计算引导UI模型
   * 需要所有必要的数据都存在
   */
  const canCalculateGuideUIModel =
    isPresent(baseResizingInfo) && isPresent(resizingStartUIModel) && isPresent(currentGridPos);

  /**
   * 计算单行高度
   * 用于后续的高度计算
   */
  const oneRowHeight = useMemo(
    () => (baseResizingInfo ? timeGridData.rows[0].height : 0),
    [baseResizingInfo, timeGridData.rows]
  );

  /**
   * 处理单日事件的拖拽调整大小
   * 当事件在一天内时，调整其高度
   */
  useEffect(() => {
    if (canCalculateGuideUIModel) {
      const { eventStartDateRowIndex, eventStartDateColumnIndex, eventEndDateColumnIndex } =
        baseResizingInfo;

      // 判断是否为单日事件（开始和结束在同一列）
      if (
        columnIndex === eventEndDateColumnIndex &&
        eventStartDateColumnIndex === eventEndDateColumnIndex
      ) {
        // 克隆开始调整大小的UI模型
        const clonedUIModel = resizingStartUIModel.clone();
        const { height, goingDurationHeight, comingDurationHeight } = clonedUIModel;

        // 计算新的高度
        // 最小高度为从事件开始行到当前指针位置的高度
        const newHeight = Math.max(
          oneRowHeight +
            (goingDurationHeight * height) / 100 +
            (comingDurationHeight * height) / 100,
          timeGridData.rows[currentGridPos.rowIndex].top -
            timeGridData.rows[eventStartDateRowIndex].top +
            oneRowHeight
        );

        // 重新计算goingDuration和comingDuration的高度比例
        const newGoingDurationHeight = (goingDurationHeight * height) / newHeight;
        const newComingDurationHeight = (comingDurationHeight * height) / newHeight;

        // 更新UI模型的属性
        clonedUIModel.setUIProps({
          height: newHeight,
          goingDurationHeight: newGoingDurationHeight,
          comingDurationHeight: newComingDurationHeight,
          modelDurationHeight: 100 - (newGoingDurationHeight + newComingDurationHeight),
        });

        // 设置引导UI模型
        setGuideUIModel(clonedUIModel);
      }
    }
  }, [
    baseResizingInfo,
    canCalculateGuideUIModel,
    columnIndex,
    currentGridPos,
    resizingStartUIModel,
    timeGridData.rows,
    oneRowHeight,
  ]);

  /**
   * 处理跨日事件的拖拽调整大小（但少于24小时）
   * 当事件跨越多天但总时长少于24小时时
   */
  useEffect(() => {
    if (canCalculateGuideUIModel) {
      const { resizeTargetUIModelColumns, eventStartDateColumnIndex, eventEndDateColumnIndex } =
        baseResizingInfo;

      // 判断是否为跨日事件（开始和结束不在同一列）
      if (
        (columnIndex === eventStartDateColumnIndex || columnIndex === eventEndDateColumnIndex) &&
        eventStartDateColumnIndex !== eventEndDateColumnIndex
      ) {
        let clonedUIModel;

        if (columnIndex === eventStartDateColumnIndex) {
          // 如果是第一列（事件开始列）
          clonedUIModel = (resizeTargetUIModelColumns[columnIndex][0] as EventUIModel).clone();
        } else {
          // 如果是最后一列（事件结束列）
          clonedUIModel = resizingStartUIModel.clone();
          // 设置高度为从顶部到当前指针位置的高度
          clonedUIModel.setUIProps({
            height: timeGridData.rows[currentGridPos.rowIndex].top + oneRowHeight,
          });
        }

        // 设置引导UI模型
        setGuideUIModel(clonedUIModel);
      }
    }
  }, [
    baseResizingInfo,
    canCalculateGuideUIModel,
    columnIndex,
    currentGridPos,
    resizingStartUIModel,
    timeGridData.rows,
    oneRowHeight,
  ]);

  /**
   * 处理拖拽结束时的逻辑
   * 当拖拽结束时，更新事件的实际数据
   */
  useWhen(() => {
    // 判断是否应该更新事件
    const shouldUpdate =
      !isDraggingCanceled && // 拖拽没有被取消
      isPresent(baseResizingInfo) && // 基础信息存在
      isPresent(currentGridPos) && // 当前网格位置存在
      isPresent(resizingStartUIModel) && // 开始调整大小的UI模型存在
      baseResizingInfo.eventEndDateColumnIndex === columnIndex; // 当前列是事件结束列

    if (shouldUpdate) {
      // 获取事件的comingDuration
      const { comingDuration = 0 } = resizingStartUIModel.model;

      // 计算目标结束时间
      // 基于当前指针位置的行结束时间，减去comingDuration
      const targetEndDate = addMinutes(
        setTimeStrToDate(
          timeGridData.columns[columnIndex].date,
          timeGridData.rows[currentGridPos.rowIndex].endTime
        ),
        -comingDuration
      );

      // 计算最小结束时间（事件开始时间 + 30分钟）
      const minEndDate = addMinutes(resizingStartUIModel.getStarts(), 30);

      // 触发事件更新，使用较大的时间作为结束时间
      eventBus.fire('beforeUpdateEvent', {
        event: resizingStartUIModel.model.toEventObject(),
        changes: {
          end: max(minEndDate, targetEndDate),
        },
      });
    }

    // 清除所有状态
    clearStates();
  }, isDraggingEnd);

  // 返回引导UI模型，用于在调整大小过程中显示预览
  return guideUIModel;
}
