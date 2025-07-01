import { useTransientUpdate } from '@src/hooks/common/useTransientUpdate';
import { dndSelector } from '@src/selectors';
import { DraggingState } from '@src/slices/dnd';
import { isPresent } from '@src/utils/type';

import type { DraggingTypes } from '@t/drag';

/**
 * 判断拖拽类型是否为时间网格相关的拖拽
 * @param draggingItemType 拖拽项目类型
 * @returns 如果是时间网格相关拖拽返回true，否则返回false
 */
function isTimeGridDraggingType(draggingItemType: DraggingTypes | null) {
  // 使用正则表达式匹配以 "event/timeGrid" 或 "gridSelection/timeGrid" 开头的拖拽类型
  return /^(event|gridSelection)\/timeGrid/.test(draggingItemType ?? '');
}

/**
 * 时间网格滚动同步钩子
 * 当用户在时间网格中拖拽事件或进行网格选择时，自动同步滚动位置
 *
 * @param scrollArea 可滚动的容器元素
 * @param rowCount 时间网格的行数，用于计算滚动边界
 */
export function useTimeGridScrollSync(scrollArea: HTMLDivElement | null, rowCount: number) {
  // 监听拖拽状态的变化，使用瞬时更新避免频繁重渲染
  useTransientUpdate(dndSelector, ({ y, draggingItemType, draggingState }) => {
    // 检查是否满足滚动同步的条件：
    // 1. 滚动区域存在
    // 2. 拖拽类型是时间网格相关
    // 3. 当前处于拖拽状态
    // 4. Y坐标存在
    if (
      isPresent(scrollArea) &&
      isTimeGridDraggingType(draggingItemType) &&
      draggingState === DraggingState.DRAGGING &&
      isPresent(y)
    ) {
      // 获取滚动区域的位置和尺寸信息
      const { offsetTop, offsetHeight, scrollHeight } = scrollArea;

      // 设置最小滚动边界为一行的高度，确保滚动响应足够敏感
      const scrollBoundary = Math.floor(scrollHeight / rowCount);

      // 计算布局的总高度（滚动区域顶部位置 + 可见高度）
      const layoutHeight = offsetTop + offsetHeight;

      // 当鼠标位置接近顶部边界时，向上滚动
      if (y < offsetTop + scrollBoundary) {
        // 计算需要滚动的距离
        const scrollDiff = y - (offsetTop + scrollBoundary);
        // 更新滚动位置，确保不会滚动到负值
        scrollArea.scrollTop = Math.max(0, scrollArea.scrollTop + scrollDiff);
      }
      // 当鼠标位置接近底部边界时，向下滚动
      else if (y > layoutHeight - scrollBoundary) {
        // 计算需要滚动的距离
        const scrollDiff = y - (layoutHeight - scrollBoundary);
        // 更新滚动位置，确保不会超出最大滚动范围
        scrollArea.scrollTop = Math.min(offsetHeight, scrollArea.scrollTop + scrollDiff);
      }
    }
  });
}
