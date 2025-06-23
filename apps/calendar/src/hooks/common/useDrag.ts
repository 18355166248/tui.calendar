import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { KEY } from '@src/constants/keyboard';
import { MINIMUM_DRAG_MOUSE_DISTANCE } from '@src/constants/mouse';
import { useDispatch, useInternalStore } from '@src/contexts/calendarStore';
import { useTransientUpdate } from '@src/hooks/common/useTransientUpdate';
import { dndSelector } from '@src/selectors';
import type { DndSlice } from '@src/slices/dnd';
import { DraggingState } from '@src/slices/dnd';
import { isKeyPressed } from '@src/utils/keyboard';
import { noop } from '@src/utils/noop';
import { isPresent } from '@src/utils/type';

import type { DraggingTypes } from '@t/drag';
import type { KeyboardEventListener, MouseEventListener } from '@t/util';

type MouseListener = (e: MouseEvent, dndSlice: DndSlice['dnd']) => void;
type KeyboardListener = (e: KeyboardEvent, dndSlice: DndSlice['dnd']) => void;

/**
 * 拖拽事件监听器接口
 * 定义了拖拽过程中各个阶段可以触发的回调函数
 */
export interface DragListeners {
  /** 鼠标按下时触发，用于初始化拖拽状态 */
  onInit?: MouseListener;
  /** 拖拽开始时触发，当鼠标移动距离超过阈值时调用 */
  onDragStart?: MouseListener;
  /** 拖拽过程中触发，鼠标移动时持续调用 */
  onDrag?: MouseListener;
  /** 鼠标释放时触发，结束拖拽操作 */
  onMouseUp?: MouseListener;
  /** 按下 ESC 键时触发，用于取消拖拽操作 */
  onPressESCKey?: KeyboardListener;
}

/**
 * 判断是否为左键点击
 * @param buttonNum - 鼠标按钮编号
 * @returns 如果是左键返回 true，否则返回 false
 */
function isLeftClick(buttonNum: number) {
  return buttonNum === 0;
}

/**
 * 判断鼠标是否移动了足够距离
 * 用于区分点击和拖拽操作
 * @param initX - 初始 X 坐标
 * @param initY - 初始 Y 坐标
 * @param x - 当前 X 坐标
 * @param y - 当前 Y 坐标
 * @returns 如果移动距离超过阈值返回 true，否则返回 false
 */
function isMouseMoved(initX: number, initY: number, x: number, y: number) {
  return (
    Math.abs(initX - x) >= MINIMUM_DRAG_MOUSE_DISTANCE ||
    Math.abs(initY - y) >= MINIMUM_DRAG_MOUSE_DISTANCE
  );
}

/**
 * 拖拽钩子函数
 * 用于处理鼠标拖拽操作，支持拖拽开始、拖拽中、拖拽结束等事件回调
 *
 * @param draggingItemType - 拖拽项的类型，用于标识当前拖拽的是什么类型的元素
 * @param listeners - 拖拽事件监听器对象，包含各种拖拽阶段的回调函数
 * @returns 返回一个鼠标按下事件处理函数，需要绑定到目标元素上
 */
export function useDrag(
  draggingItemType: DraggingTypes,
  { onInit, onDragStart, onDrag, onMouseUp, onPressESCKey }: DragListeners = {}
) {
  // 获取拖拽相关的 dispatch 函数
  const { initDrag, setDragging, cancelDrag, reset } = useDispatch('dnd');

  // 获取内部 store 和拖拽状态引用
  const store = useInternalStore();
  const dndSliceRef = useRef(store.getState().dnd);
  useTransientUpdate(dndSelector, (dndState) => {
    dndSliceRef.current = dndState;
  });

  // 跟踪拖拽是否已开始
  const [isStarted, setStarted] = useState(false);

  // 使用 ref 存储事件处理函数，避免闭包问题
  const handleMouseMoveRef = useRef<MouseEventListener | null>(null);
  const handleMouseUpRef = useRef<MouseEventListener | null>(null);
  const handleKeyDownRef = useRef<KeyboardEventListener | null>(null);

  /**
   * 鼠标按下事件处理函数
   * 初始化拖拽状态，记录初始位置
   */
  const handleMouseDown = useCallback<MouseEventListener>(
    (e) => {
      // 只处理左键点击
      if (!isLeftClick(e.button)) {
        return;
      }

      // 禁用默认的拖拽行为
      if (e.currentTarget) {
        (e.currentTarget as HTMLElement).ondragstart = function () {
          return false;
        };
      }

      // 防止文本选择
      e.preventDefault();

      // 标记拖拽开始并初始化拖拽状态
      setStarted(true);
      initDrag({
        draggingItemType,
        initX: e.clientX,
        initY: e.clientY,
      });
      onInit?.(e, dndSliceRef.current);
    },
    [onInit, draggingItemType, initDrag]
  );

  /**
   * 鼠标移动事件处理函数
   * 处理拖拽过程中的移动逻辑
   */
  const handleMouseMove = useCallback<MouseEventListener>(
    (e) => {
      const {
        initX,
        initY,
        draggingState,
        draggingItemType: currentDraggingItemType,
      } = dndSliceRef.current;

      // 检查拖拽类型是否匹配，如果不匹配则重置状态
      if (currentDraggingItemType !== draggingItemType) {
        setStarted(false);
        reset();

        return;
      }

      // 检查鼠标是否移动了足够距离才认为是拖拽
      if (
        isPresent(initX) &&
        isPresent(initY) &&
        !isMouseMoved(initX, initY, e.clientX, e.clientY)
      ) {
        return;
      }

      // 如果还在初始化状态，则开始拖拽
      if (draggingState <= DraggingState.INIT) {
        setDragging({ x: e.clientX, y: e.clientY });
        onDragStart?.(e, dndSliceRef.current);

        return;
      }

      // 更新拖拽位置并触发拖拽回调
      setDragging({ x: e.clientX, y: e.clientY });
      onDrag?.(e, dndSliceRef.current);
    },
    [draggingItemType, onDrag, onDragStart, setDragging, reset]
  );

  /**
   * 鼠标释放事件处理函数
   * 结束拖拽操作
   */
  const handleMouseUp = useCallback<MouseEventListener>(
    (e) => {
      e.stopPropagation();

      if (isStarted) {
        onMouseUp?.(e, dndSliceRef.current);
        setStarted(false);
        reset();
      }
    },
    [isStarted, onMouseUp, reset]
  );

  /**
   * 键盘事件处理函数
   * 处理 ESC 键取消拖拽
   */
  const handleKeyDown = useCallback<KeyboardEventListener>(
    (e) => {
      if (isKeyPressed(e, KEY.ESCAPE)) {
        setStarted(false);
        cancelDrag();
        onPressESCKey?.(e, dndSliceRef.current);
      }
    },
    [onPressESCKey, cancelDrag]
  );

  // 更新 ref 中的事件处理函数
  useEffect(() => {
    handleMouseMoveRef.current = handleMouseMove;
    handleMouseUpRef.current = handleMouseUp;
    handleKeyDownRef.current = handleKeyDown;
  }, [handleKeyDown, handleMouseMove, handleMouseUp]);

  // 根据拖拽状态添加/移除全局事件监听器
  useEffect(() => {
    const wrappedHandleMouseMove: MouseEventListener = (e) => handleMouseMoveRef.current?.(e);
    const wrappedHandleMouseUp: MouseEventListener = (e) => handleMouseUpRef.current?.(e);
    const wrappedHandleKeyDown: KeyboardEventListener = (e) => handleKeyDownRef.current?.(e);

    if (isStarted) {
      // 拖拽开始时添加全局事件监听器
      document.addEventListener('mousemove', wrappedHandleMouseMove);
      document.addEventListener('mouseup', wrappedHandleMouseUp);
      document.addEventListener('keydown', wrappedHandleKeyDown);

      return () => {
        // 清理事件监听器
        document.removeEventListener('mousemove', wrappedHandleMouseMove);
        document.removeEventListener('mouseup', wrappedHandleMouseUp);
        document.removeEventListener('keydown', wrappedHandleKeyDown);
      };
    }

    return noop;
  }, [isStarted, reset]);

  // 返回鼠标按下事件处理函数，供外部绑定使用
  return handleMouseDown;
}
