import produce from 'immer';

import type EventUIModel from '@src/model/eventUIModel';

import type { DraggingTypes } from '@t/drag';
import type { CalendarState, CalendarStore, SetState } from '@t/store';

/**
 * 拖拽状态枚举
 * 定义了拖拽操作的不同阶段
 */
export enum DraggingState {
  IDLE, // 空闲状态 - 未进行任何拖拽操作
  INIT, // 初始化状态 - 拖拽开始初始化
  DRAGGING, // 拖拽中状态 - 正在执行拖拽操作
  CANCELED, // 已取消状态 - 拖拽操作被取消
}

/**
 * DnD 切片接口
 * 定义了拖拽相关的状态数据结构
 */
export interface DndSlice {
  dnd: {
    draggingItemType: DraggingTypes | null; // 当前拖拽的项目类型
    draggingState: DraggingState; // 当前拖拽状态
    initX: number | null; // 拖拽开始时的 X 坐标
    initY: number | null; // 拖拽开始时的 Y 坐标
    x: number | null; // 当前拖拽位置的 X 坐标
    y: number | null; // 当前拖拽位置的 Y 坐标
    draggingEventUIModel: EventUIModel | null; // 正在拖拽的事件 UI 模型
  };
}

/**
 * DnD 调度器接口
 * 定义了操作拖拽状态的方法集合
 */
export interface DndDispatchers {
  /**
   * 初始化拖拽操作
   * @param initState 包含初始坐标和拖拽类型的初始状态
   */
  initDrag: (initState: Pick<DndSlice['dnd'], 'initX' | 'initY' | 'draggingItemType'>) => void;

  /**
   * 设置拖拽状态
   * @param newState 新的拖拽状态数据（不包含 draggingState）
   */
  setDragging: (newState: Partial<Omit<DndSlice['dnd'], 'draggingState'>>) => void;

  /**
   * 取消拖拽操作
   */
  cancelDrag: () => void;

  /**
   * 重置拖拽状态到初始值
   */
  reset: () => void;

  /**
   * 设置正在拖拽的事件 UI 模型
   * @param eventUIModel 事件 UI 模型或 null
   */
  setDraggingEventUIModel: (eventUIModel: EventUIModel | null) => void;
}

/**
 * 创建 DnD 切片
 * 返回初始化的拖拽状态对象
 * @returns 包含默认拖拽状态的切片对象
 */
export function createDndSlice(): DndSlice {
  return {
    dnd: {
      draggingItemType: null,
      draggingState: DraggingState.IDLE,
      initX: null,
      initY: null,
      x: null,
      y: null,
      draggingEventUIModel: null,
    },
  };
}

/**
 * 创建 DnD 调度器
 * 返回用于操作拖拽状态的方法集合
 * @param set 状态设置函数
 * @returns 包含拖拽操作方法的调度器对象
 */
export function createDndDispatchers(set: SetState<CalendarStore>): DndDispatchers {
  return {
    /**
     * 初始化拖拽操作
     * 设置初始坐标和拖拽类型，并将状态设置为 INIT
     */
    initDrag: (initState) => {
      set(
        produce<CalendarState>((state) => {
          state.dnd = {
            ...state.dnd,
            ...initState,
            draggingState: DraggingState.INIT,
          };
        })
      );
    },

    /**
     * 设置拖拽状态
     * 更新拖拽相关数据并将状态设置为 DRAGGING
     */
    setDragging: (newState) => {
      set(
        produce<CalendarState>((state) => {
          state.dnd = {
            ...state.dnd,
            ...newState,
            draggingState: DraggingState.DRAGGING,
          };
        })
      );
    },

    /**
     * 取消拖拽操作
     * 重置所有拖拽状态并将状态设置为 CANCELED
     */
    cancelDrag: () => {
      set(
        produce<CalendarState>((state) => {
          state.dnd = createDndSlice().dnd;
          state.dnd.draggingState = DraggingState.CANCELED;
        })
      );
    },

    /**
     * 重置拖拽状态
     * 将所有拖拽相关状态重置为初始值
     */
    reset: () => {
      set(
        produce<CalendarState>((state) => {
          state.dnd = createDndSlice().dnd;
        })
      );
    },

    /**
     * 设置正在拖拽的事件 UI 模型
     * 如果提供了事件模型，会创建一个克隆副本以避免引用问题
     */
    setDraggingEventUIModel: (eventUIModel) => {
      set(
        produce<CalendarState>((state) => {
          state.dnd.draggingEventUIModel = eventUIModel?.clone() ?? null;
        })
      );
    },
  };
}
