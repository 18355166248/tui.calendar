import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';

import { useStore } from '@src/contexts/calendarStore';
import { useEventBus } from '@src/contexts/eventBus';
import { useWhen } from '@src/hooks/common/useWhen';
import { useCurrentPointerPositionInGrid } from '@src/hooks/event/useCurrentPointerPositionInGrid';
import { useDraggingEvent } from '@src/hooks/event/useDraggingEvent';
import type EventUIModel from '@src/model/eventUIModel';
import type TZDate from '@src/time/date';
import { addMilliseconds, addMinutes, MS_PER_DAY, MS_PER_THIRTY_MINUTES } from '@src/time/datetime';
import { isNil, isPresent } from '@src/utils/type';

import type { GridPosition, GridPositionFinder, TimeGridData } from '@t/grid';
import type { CalendarState } from '@t/store';

// 30分钟时间间隔常量
const THIRTY_MINUTES = 30;

/**
 * 根据时间计算当前在时间网格中的索引位置
 * @param time - 目标时间
 * @param hourStart - 时间网格开始的小时数
 * @returns 在时间网格中的行索引
 */
function getCurrentIndexByTime(time: TZDate, hourStart: number) {
  const hour = time.getHours() - hourStart;
  const minutes = time.getMinutes();

  // 计算在30分钟间隔网格中的位置
  return hour * 2 + Math.floor(minutes / THIRTY_MINUTES);
}

/**
 * 计算移动中事件的位置信息（top和height）
 * @param draggingEvent - 正在拖拽的事件
 * @param columnDiff - 列方向上的移动差值
 * @param rowDiff - 行方向上的移动差值
 * @param timeGridDataRows - 时间网格数据行
 * @param currentDate - 当前日期
 * @returns 包含top和height的位置对象
 */
function getMovingEventPosition({
  draggingEvent,
  columnDiff,
  rowDiff,
  timeGridDataRows,
  currentDate,
}: {
  draggingEvent: EventUIModel;
  columnDiff: number;
  rowDiff: number;
  timeGridDataRows: TimeGridData['rows'];
  currentDate: TZDate;
}) {
  const rowHeight = timeGridDataRows[0].height;
  const maxHeight = rowHeight * timeGridDataRows.length;
  // 计算时间差（毫秒）
  const millisecondsDiff = rowDiff * MS_PER_THIRTY_MINUTES + columnDiff * MS_PER_DAY;
  const hourStart = Number(timeGridDataRows[0].startTime.split(':')[0]);

  // 获取事件的持续时间信息
  const { goingDuration = 0, comingDuration = 0 } = draggingEvent.model;
  // 计算事件的开始和结束时间（包含缓冲时间）
  const goingStart = addMinutes(draggingEvent.getStarts(), -goingDuration);
  const comingEnd = addMinutes(draggingEvent.getEnds(), comingDuration);
  // 计算移动后的新开始和结束时间
  const nextStart = addMilliseconds(goingStart, millisecondsDiff);
  const nextEnd = addMilliseconds(comingEnd, millisecondsDiff);

  // 计算在网格中的开始和结束索引
  const startIndex = Math.max(getCurrentIndexByTime(nextStart, hourStart), 0);
  const endIndex = Math.min(getCurrentIndexByTime(nextEnd, hourStart), timeGridDataRows.length - 1);

  // 检查事件是否跨越到前一天
  const isStartAtPrevDate =
    nextStart.getFullYear() < currentDate.getFullYear() ||
    nextStart.getMonth() < currentDate.getMonth() ||
    nextStart.getDate() < currentDate.getDate();
  // 检查事件是否跨越到后一天
  const isEndAtNextDate =
    nextEnd.getFullYear() > currentDate.getFullYear() ||
    nextEnd.getMonth() > currentDate.getMonth() ||
    nextEnd.getDate() > currentDate.getDate();

  // 计算索引差值
  const indexDiff = endIndex - (isStartAtPrevDate ? 0 : startIndex);

  // 计算top位置：如果开始时间在前一天，则从顶部开始
  const top = isStartAtPrevDate ? 0 : timeGridDataRows[startIndex].top;
  // 计算height：如果结束时间在后一天，则占满整个高度
  const height = isEndAtNextDate ? maxHeight : Math.max(indexDiff, 1) * rowHeight;

  return { top, height };
}

// 选择器：获取拖拽初始X坐标
const initXSelector = (state: CalendarState) => state.dnd.initX;
// 选择器：获取拖拽初始Y坐标
const initYSelector = (state: CalendarState) => state.dnd.initY;

/**
 * 时间网格事件移动钩子
 * 处理时间网格中事件的拖拽移动逻辑
 * @param gridPositionFinder - 网格位置查找器
 * @param timeGridData - 时间网格数据
 * @returns 包含移动中事件和下一个开始时间的对象
 */
export function useTimeGridEventMove({
  gridPositionFinder,
  timeGridData,
}: {
  gridPositionFinder: GridPositionFinder;
  timeGridData: TimeGridData;
}) {
  // 获取拖拽初始位置
  const initX = useStore(initXSelector);
  const initY = useStore(initYSelector);

  // 获取事件总线
  const eventBus = useEventBus();
  // 获取拖拽事件状态
  const { isDraggingEnd, isDraggingCanceled, draggingEvent, clearDraggingEvent } = useDraggingEvent(
    'timeGrid',
    'move'
  );

  // 获取当前指针在网格中的位置
  const [currentGridPos, clearCurrentGridPos] = useCurrentPointerPositionInGrid(gridPositionFinder);
  // 存储初始网格位置的引用
  const initGridPosRef = useRef<GridPosition | null>(null);

  // 当初始位置变化时，计算初始网格位置
  useEffect(() => {
    if (isPresent(initX) && isPresent(initY)) {
      initGridPosRef.current = gridPositionFinder({
        clientX: initX,
        clientY: initY,
      });
    }
  }, [gridPositionFinder, initX, initY]);

  // 计算网格位置差值
  const gridDiff = useMemo(() => {
    if (isNil(initGridPosRef.current) || isNil(currentGridPos)) {
      return null;
    }

    return {
      columnDiff: currentGridPos.columnIndex - initGridPosRef.current.columnIndex,
      rowDiff: currentGridPos.rowIndex - initGridPosRef.current.rowIndex,
    };
  }, [currentGridPos]);

  // 获取拖拽事件的开始时间
  const startDateTime = useMemo(() => {
    if (isNil(draggingEvent)) {
      return null;
    }

    return draggingEvent.getStarts();
  }, [draggingEvent]);

  // 清理状态的函数
  const clearState = useCallback(() => {
    clearCurrentGridPos();
    clearDraggingEvent();
    initGridPosRef.current = null;
  }, [clearCurrentGridPos, clearDraggingEvent]);

  // 计算下一个开始时间
  const nextStartTime = useMemo(() => {
    if (isNil(gridDiff) || isNil(startDateTime)) {
      return null;
    }

    // 根据网格差值计算新的开始时间
    return addMilliseconds(
      startDateTime,
      gridDiff.rowDiff * MS_PER_THIRTY_MINUTES + gridDiff.columnDiff * MS_PER_DAY
    );
  }, [gridDiff, startDateTime]);

  // 计算移动中的事件对象
  const movingEvent = useMemo(() => {
    if (isNil(draggingEvent) || isNil(currentGridPos) || isNil(gridDiff)) {
      return null;
    }

    // 克隆拖拽事件
    const clonedEvent = draggingEvent.clone();
    // 计算移动后事件的位置信息
    const { top, height } = getMovingEventPosition({
      draggingEvent: clonedEvent,
      columnDiff: gridDiff.columnDiff,
      rowDiff: gridDiff.rowDiff,
      timeGridDataRows: timeGridData.rows,
      currentDate: timeGridData.columns[currentGridPos.columnIndex].date,
    });

    // 设置事件的UI属性
    clonedEvent.setUIProps({
      left: timeGridData.columns[currentGridPos.columnIndex].left,
      width: timeGridData.columns[currentGridPos.columnIndex].width,
      top,
      height,
    });

    return clonedEvent;
  }, [currentGridPos, draggingEvent, gridDiff, timeGridData.columns, timeGridData.rows]);

  // 当拖拽结束时处理事件更新
  useWhen(() => {
    // 检查是否需要更新事件
    const shouldUpdate =
      !isDraggingCanceled &&
      isPresent(draggingEvent) &&
      isPresent(currentGridPos) &&
      isPresent(gridDiff) &&
      isPresent(nextStartTime) &&
      (gridDiff.rowDiff !== 0 || gridDiff.columnDiff !== 0);

    if (shouldUpdate) {
      // 计算事件持续时间
      const duration = draggingEvent.duration();
      // 计算新的结束时间
      const nextEndTime = addMilliseconds(nextStartTime, duration);

      // 触发事件更新事件
      eventBus.fire('beforeUpdateEvent', {
        event: draggingEvent.model.toEventObject(),
        changes: {
          start: nextStartTime,
          end: nextEndTime,
        },
      });
    }

    // 清理状态
    clearState();
  }, isDraggingEnd);

  return {
    movingEvent,
    nextStartTime,
  };
}
