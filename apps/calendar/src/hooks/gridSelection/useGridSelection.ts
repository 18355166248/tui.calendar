import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { useDispatch, useStore } from '@src/contexts/calendarStore';
import { useEventBus } from '@src/contexts/eventBus';
import { useLayoutContainer } from '@src/contexts/layoutContainer';
import { cls } from '@src/helpers/css';
import { DRAGGING_TYPE_CREATORS } from '@src/helpers/drag';
import { useClickPrevention } from '@src/hooks/common/useClickPrevention';
import { useDrag } from '@src/hooks/common/useDrag';
import { useTransientUpdate } from '@src/hooks/common/useTransientUpdate';
import { dndSelector, optionsSelector } from '@src/selectors';
import { DraggingState } from '@src/slices/dnd';
import type { GridSelectionType } from '@src/slices/gridSelection';
import type TZDate from '@src/time/date';
import { isPresent } from '@src/utils/type';

import type { GridSelectionData } from '@t/components/gridSelection';
import type { GridPosition, GridPositionFinder } from '@t/grid';
import type { Coordinates } from '@t/mouse';
import type { CalendarState } from '@t/store';

/**
 * 网格选择类型映射表
 * 将不同的视图类型映射到对应的选择类型
 */
const GRID_SELECTION_TYPE_MAP = {
  dayGridMonth: 'month', // 月视图
  dayGridWeek: 'allday', // 周视图的全天区域
  timeGrid: 'time', // 时间网格视图
};

/**
 * 对两个日期进行排序，返回 [较早日期, 较晚日期] 的数组
 * @param a 第一个日期
 * @param b 第二个日期
 * @returns 排序后的日期数组
 */
function sortDates(a: TZDate, b: TZDate) {
  const isIncreased = a < b;

  return isIncreased ? [a, b] : [b, a];
}

/**
 * 网格选择 Hook
 * 用于处理日历网格的选择功能，包括点击选择、拖拽选择等
 *
 * @param type 网格选择类型
 * @param selectionSorter 选择排序器，用于处理初始位置和当前位置的选择范围
 * @param dateGetter 日期获取器，从日期集合和网格选择数据中提取日期范围
 * @param dateCollection 日期集合
 * @param gridPositionFinder 网格位置查找器，用于从鼠标事件中获取网格位置
 * @returns 鼠标按下事件处理函数
 */
export function useGridSelection<DateCollection>({
  type,
  selectionSorter,
  dateGetter,
  dateCollection,
  gridPositionFinder,
}: {
  type: GridSelectionType;
  selectionSorter: (initPos: GridPosition, currentPos: GridPosition) => GridSelectionData;
  dateGetter: (
    dateCollection: DateCollection,
    gridSelection: GridSelectionData
  ) => [TZDate, TZDate];
  dateCollection: DateCollection;
  gridPositionFinder: GridPositionFinder;
}) {
  // 获取日历配置选项
  const { useFormPopup, gridSelection: gridSelectionOptions } = useStore(optionsSelector);
  const { enableDblClick, enableClick } = gridSelectionOptions;

  // 获取 dispatch 函数
  const { setGridSelection, addGridSelection, clearAll } = useDispatch('gridSelection');
  const { hideAllPopup, showFormPopup } = useDispatch('popup');
  const eventBus = useEventBus();
  const layoutContainer = useLayoutContainer();

  // 状态管理
  const [initMousePosition, setInitMousePosition] = useState<Coordinates | null>(null); // 初始鼠标位置
  const [initGridPosition, setInitGridPosition] = useState<GridPosition | null>(null); // 初始网格位置
  const isSelectingGridRef = useRef(false); // 是否正在选择网格
  const gridSelectionRef = useRef<GridSelectionData | null>(null); // 当前网格选择数据

  // 监听网格选择状态变化
  useTransientUpdate(
    useCallback((state: CalendarState) => state.gridSelection[type], [type]),
    (gridSelection) => {
      gridSelectionRef.current = gridSelection;
    }
  );

  // 监听拖拽状态变化
  useTransientUpdate(dndSelector, ({ draggingState, draggingItemType }) => {
    isSelectingGridRef.current =
      draggingItemType === currentGridSelectionType && draggingState >= DraggingState.INIT;
  });

  // 当前网格选择类型
  const currentGridSelectionType = DRAGGING_TYPE_CREATORS.gridSelection(type);

  /**
   * 根据鼠标位置设置网格选择
   * @param e 鼠标事件
   */
  const setGridSelectionByPosition = (e: MouseEvent) => {
    const gridPosition = gridPositionFinder(e);

    if (isPresent(initGridPosition) && isPresent(gridPosition)) {
      setGridSelection(type, selectionSorter(initGridPosition, gridPosition));
    }
  };

  /**
   * 处理点击和双击事件，防止冲突
   */
  const [handleClickWithDebounce, handleDblClickPreventingClick] = useClickPrevention({
    onClick: (e: MouseEvent) => {
      if (enableClick) {
        onMouseUp(e, true);
      }
    },
    onDblClick: (e: MouseEvent) => {
      if (enableDblClick) {
        onMouseUp(e, true);
      }
    },
    delay: 250, // 启发式延迟值
  });

  /**
   * 处理鼠标抬起事件（带点击检测）
   * @param e 鼠标事件
   */
  const onMouseUpWithClick = (e: MouseEvent) => {
    const isClick = e.detail <= 1;

    // 如果点击和双击都未启用，或者只启用双击但这是单击，则直接返回
    if (!enableClick && (!enableDblClick || isClick)) {
      return;
    }

    if (enableClick) {
      if (isClick) {
        handleClickWithDebounce(e);
      } else {
        handleDblClickPreventingClick(e);
      }

      return;
    }

    onMouseUp(e, true);
  };

  /**
   * 处理鼠标抬起事件
   * @param e 鼠标事件
   * @param isClickEvent 是否为点击事件
   */
  const onMouseUp = (e: MouseEvent, isClickEvent: boolean) => {
    // 如果是点击事件，在鼠标抬起时创建网格选择
    if (isClickEvent) {
      setGridSelectionByPosition(e);
    }

    // 如果存在网格选择数据，处理选择结果
    if (isPresent(gridSelectionRef.current)) {
      // 对日期进行排序，确保开始日期早于结束日期
      const [startDate, endDate] = sortDates(
        ...dateGetter(dateCollection, gridSelectionRef.current)
      );

      // 如果需要显示表单弹窗且有初始鼠标位置
      if (useFormPopup && isPresent(initMousePosition)) {
        // 计算弹窗箭头位置（鼠标起始位置和当前位置的中点）
        const popupArrowPointPosition = {
          top: (e.clientY + initMousePosition.y) / 2,
          left: (e.clientX + initMousePosition.x) / 2,
        };

        // 显示创建事件的表单弹窗
        showFormPopup({
          isCreationPopup: true,
          title: '',
          location: '',
          start: startDate,
          end: endDate,
          isAllday: type !== 'timeGrid', // 非时间网格视图为全天事件
          isPrivate: false,
          popupArrowPointPosition,
          close: clearAll,
        });
      }

      // 获取网格选择元素
      const gridSelectionSelector = `.${cls(GRID_SELECTION_TYPE_MAP[type])}.${cls(
        'grid-selection'
      )}`;
      const gridSelectionElements = Array.from(
        layoutContainer?.querySelectorAll(gridSelectionSelector) ?? []
      );

      // 触发日期时间选择事件
      eventBus.fire('selectDateTime', {
        start: startDate.toDate(),
        end: endDate.toDate(),
        isAllday: type !== 'timeGrid',
        nativeEvent: e,
        gridSelectionElements,
      });
    }
  };

  /**
   * 清除网格选择
   */
  const clearGridSelection = useCallback(() => {
    setInitMousePosition(null);
    setInitGridPosition(null);
    setGridSelection(type, null);
  }, [setGridSelection, type]);

  /**
   * 鼠标按下事件处理函数
   * 使用拖拽 Hook 来处理各种鼠标事件
   */
  const onMouseDown = useDrag(currentGridSelectionType, {
    // 初始化拖拽
    onInit: (e) => {
      if (useFormPopup) {
        // 记录初始鼠标位置
        setInitMousePosition({
          x: e.clientX,
          y: e.clientY,
        });
        hideAllPopup();
      }

      // 获取并记录初始网格位置
      const gridPosition = gridPositionFinder(e);

      if (isPresent(gridPosition)) {
        setInitGridPosition(gridPosition);
      }

      // 如果不使用表单弹窗，直接添加网格选择
      if (!useFormPopup) {
        addGridSelection(type, gridSelectionRef.current);
      }
    },
    // 开始拖拽
    onDragStart: (e) => {
      // 拖拽事件中，在鼠标移动时创建网格选择
      setGridSelectionByPosition(e);
    },
    // 拖拽中
    onDrag: (e) => {
      if (isSelectingGridRef.current) {
        setGridSelectionByPosition(e);
      }
    },
    // 鼠标抬起
    onMouseUp: (e, { draggingState }) => {
      // 阻止事件冒泡，避免触发父元素的事件处理器
      e.stopPropagation();

      // 判断是否为点击事件（拖拽状态小于等于初始状态表示没有发生拖拽）
      const isClickEvent = draggingState <= DraggingState.INIT;

      if (isClickEvent) {
        // 如果是点击事件，使用带点击检测的处理函数
        // 这个函数会处理单击和双击的冲突，并根据配置决定是否触发事件
        onMouseUpWithClick(e);
      } else {
        // 如果是拖拽结束事件，直接调用鼠标抬起处理函数
        // 传入 false 表示这不是点击事件，而是拖拽结束事件
        onMouseUp(e, isClickEvent);
      }
    },
    // 按 ESC 键取消选择
    onPressESCKey: clearGridSelection,
  });

  // 组件卸载时清除网格选择
  useEffect(() => clearGridSelection, [clearGridSelection]);

  return onMouseDown;
}
