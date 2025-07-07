import type EventModel from '@src/model/eventModel';
import EventUIModel from '@src/model/eventUIModel';
import TZDate from '@src/time/date';
import { makeDateRange, MS_PER_DAY, toEndOfDay, toFormat, toStartOfDay } from '@src/time/datetime';
import type { Filter } from '@src/utils/collection';
import Collection from '@src/utils/collection';
import { isUndefined } from '@src/utils/type';

import type { CollisionGroup, Matrix, Matrix3d } from '@t/events';

/**
 * 计算事件碰撞组
 * 将重叠的事件分组，用于在日历视图中正确排列事件块
 *
 * @param {Array<EventModel|EventUIModel>} events - 事件模型或UI模型列表
 * @param {boolean} [usingTravelTime = true] - 是否考虑行程时间，默认为true
 * @returns {Array<number[]>} 碰撞组数组，每个子数组包含同一组中事件的ID
 *
 * 算法说明：
 * 1. 遍历所有事件，从第二个事件开始
 * 2. 对于每个事件，检查是否与之前的事件重叠
 * 3. 如果不重叠，创建新的碰撞组
 * 4. 如果重叠，将事件添加到包含重叠事件的碰撞组中
 */
export function getCollisionGroup<Events extends EventModel | EventUIModel>(
  events: Events[],
  usingTravelTime = true
) {
  const collisionGroups: CollisionGroup = [];
  let previousEventList: Array<Events>;

  // 如果没有事件，返回空数组
  if (!events.length) {
    return collisionGroups;
  }

  // 第一个事件总是第一个碰撞组的开始
  collisionGroups[0] = [events[0].cid()];

  // 从第二个事件开始处理
  events.slice(1).forEach((event: Events, index: number) => {
    // 获取当前事件之前的所有事件（倒序排列，便于查找）
    previousEventList = events.slice(0, index + 1).reverse();

    // 查找与当前事件重叠的前一个事件
    const found = previousEventList.find((previous: Events) =>
      event.collidesWith(previous, usingTravelTime)
    );

    if (!found) {
      // 如果没有找到重叠的事件，创建新的碰撞组
      collisionGroups.push([event.cid()]);
    } else {
      // 如果找到重叠的事件，将当前事件添加到包含该重叠事件的碰撞组中
      collisionGroups
        .slice()
        .reverse()
        .some((group) => {
          if (~group.indexOf(found.cid())) {
            // 找到包含重叠事件的碰撞组，将当前事件添加进去
            group.push(event.cid());

            return true; // 返回true停止循环
          }

          return false;
        });
    }
  });

  return collisionGroups;
}

/**
 * 获取矩阵中指定列的最后一个非空行索引
 *
 * @param {array[]} matrix - 二维矩阵
 * @param {number} col - 列索引
 * @returns {number} 该列中最后一个非空行的索引，如果没有找到则返回-1
 */
export function getLastRowInColumn(matrix: Array<any[]>, col: number) {
  let { length: row } = matrix;

  // 从最后一行开始向上查找
  while (row > 0) {
    row -= 1;
    if (!isUndefined(matrix[row][col])) {
      return row;
    }
  }

  return -1;
}

/**
 * 计算事件块的矩阵布局
 * 根据碰撞组信息，为每个事件分配在矩阵中的位置
 *
 * @param {Collection} collection - 事件模型集合
 * @param {Array<number[]>} collisionGroups - 碰撞组数组
 * @param {boolean} [usingTravelTime = true] - 是否考虑行程时间
 * @returns {array} 三维矩阵，每个子矩阵代表一个碰撞组的布局
 *
 * 算法说明：
 * 1. 对每个碰撞组创建一个矩阵
 * 2. 为组内每个事件找到合适的位置（行和列）
 * 3. 如果当前列没有事件，放在第一行
 * 4. 如果当前列有事件但不重叠，放在下一行
 * 5. 如果重叠，尝试下一列
 */
export function getMatrices<T extends EventModel | EventUIModel>(
  collection: Collection<T>,
  collisionGroups: CollisionGroup,
  usingTravelTime = true
): Matrix3d<T> {
  const result: Matrix3d<T> = [];

  // 为每个碰撞组创建矩阵
  collisionGroups.forEach((group) => {
    const matrix: Matrix<T> = [[]];

    // 为组内每个事件分配位置
    group.forEach((eventID) => {
      const event = collection.get(eventID) as T;
      let col = 0;
      let found = false;
      let nextRow;
      let lastRowInColumn;

      // 寻找合适的位置
      while (!found) {
        lastRowInColumn = getLastRowInColumn(matrix, col);

        if (lastRowInColumn === -1) {
          // 当前列没有事件，放在第一行
          matrix[0].push(event);
          found = true;
        } else if (!event.collidesWith(matrix[lastRowInColumn][col], usingTravelTime)) {
          // 当前列有事件但不重叠，放在下一行
          nextRow = lastRowInColumn + 1;
          if (isUndefined(matrix[nextRow])) {
            matrix[nextRow] = [];
          }
          matrix[nextRow][col] = event;
          found = true;
        }

        // 如果当前位置不合适，尝试下一列
        col += 1;
      }
    });

    result.push(matrix);
  });

  return result;
}

/**
 * 创建日期范围过滤器
 * 用于筛选在指定日期范围内的事件
 *
 * @param {TZDate} start - 开始日期
 * @param {TZDate} end - 结束日期
 * @returns {function} 返回一个过滤函数，用于判断事件是否在指定日期范围内
 *
 * 过滤逻辑：
 * 事件与日期范围有交集的条件：
 * - 事件开始时间 >= 范围开始时间 且 事件结束时间 <= 范围结束时间（完全包含）
 * - 事件开始时间 < 范围开始时间 且 事件结束时间 >= 范围开始时间（左重叠）
 * - 事件结束时间 > 范围结束时间 且 事件开始时间 <= 范围结束时间（右重叠）
 *
 * 简化为：!(事件结束时间 < 范围开始时间 || 事件开始时间 > 范围结束时间)
 */
export function getEventInDateRangeFilter(
  start: TZDate,
  end: TZDate
): Filter<EventModel | EventUIModel> {
  return (model) => {
    const ownStarts = model.getStarts();
    const ownEnds = model.getEnds();

    // 检查事件是否与日期范围有交集
    // 等价于：
    // (ownStarts >= start && ownEnds <= end) ||  // 完全包含
    // (ownStarts < start && ownEnds >= start) || // 左重叠
    // (ownEnds > end && ownStarts <= end)        // 右重叠
    return !(ownEnds < start || ownStarts > end);
  };
}

/**
 * 为UI模型设置位置信息
 * 根据矩阵布局信息，为每个UI模型计算top、left、width等位置属性
 *
 * @param {TZDate} start - 渲染的开始日期
 * @param {TZDate} end - 渲染的结束日期
 * @param {Matrix3d} matrices - 控制器计算出的矩阵
 * @param {function} [iteratee] - 可选的迭代函数，对每个UI模型执行额外操作
 */
export function positionUIModels(
  start: TZDate,
  end: TZDate,
  matrices: Matrix3d<EventUIModel>,
  iteratee?: (uiModel: EventUIModel) => void
) {
  // 生成要渲染的日期列表（YYYYMMDD格式）
  const ymdListToRender = makeDateRange(start, end, MS_PER_DAY).map((date) =>
    toFormat(date, 'YYYYMMDD')
  );

  // 遍历所有矩阵
  matrices.forEach((matrix) => {
    // 遍历矩阵中的每一列
    matrix.forEach((column) => {
      // 遍历列中的每个UI模型
      column.forEach((uiModel, index) => {
        if (!uiModel) {
          return;
        }

        // 获取事件开始日期的YYYYMMDD格式
        const ymd = toFormat(uiModel.getStarts(), 'YYYYMMDD');

        // 计算事件跨越的天数
        const dateLength = makeDateRange(
          toStartOfDay(uiModel.getStarts()),
          toEndOfDay(uiModel.getEnds()),
          MS_PER_DAY
        ).length;

        // 设置UI模型的位置属性
        uiModel.top = index; // 在列中的行位置
        uiModel.left = ymdListToRender.indexOf(ymd); // 在日期列表中的位置
        uiModel.width = dateLength; // 事件跨越的宽度

        // 执行可选的迭代函数
        iteratee?.(uiModel);
      });
    });
  });
}

/**
 * 限制单个UI模型的渲染范围
 * 当事件超出渲染范围时，调整其开始和结束时间
 *
 * @param {TZDate} start - 渲染范围的开始时间
 * @param {TZDate} end - 渲染范围的结束时间
 * @param {EventUIModel} uiModel - UI模型实例
 * @returns {EventUIModel} 限制后的UI模型
 */
function limit(start: TZDate, end: TZDate, uiModel: EventUIModel) {
  // 如果事件开始时间早于渲染范围开始时间
  if (uiModel.getStarts() < start) {
    uiModel.exceedLeft = true; // 标记超出左边界
    uiModel.renderStarts = new TZDate(start); // 设置渲染开始时间为范围开始时间
  }

  // 如果事件结束时间晚于渲染范围结束时间
  if (uiModel.getEnds() > end) {
    uiModel.exceedRight = true; // 标记超出右边界
    uiModel.renderEnds = new TZDate(end); // 设置渲染结束时间为范围结束时间
  }

  return uiModel;
}

/**
 * 限制UI模型的渲染范围
 * 可以处理单个UI模型或UI模型集合
 *
 * @param {TZDate} start - 渲染范围的开始时间
 * @param {TZDate} end - 渲染范围的结束时间
 * @param {Collection<EventUIModel>|EventUIModel} uiModelColl - UI模型集合或单个UI模型
 * @returns {?EventUIModel} 当第三个参数是单个UI模型时返回该模型，否则返回null
 */
export function limitRenderRange(
  start: TZDate,
  end: TZDate,
  uiModelColl: Collection<EventUIModel> | EventUIModel
) {
  if (uiModelColl instanceof Collection) {
    // 如果是集合，遍历每个UI模型并限制其渲染范围
    uiModelColl.each((uiModel) => {
      limit(start, end, uiModel);

      return true;
    });

    return null;
  }

  // 如果是单个UI模型，直接限制其渲染范围
  return limit(start, end, uiModelColl);
}

/**
 * 将事件模型集合转换为UI模型集合
 * 为每个事件模型创建对应的UI模型
 *
 * @param {Collection} eventCollection - 事件模型集合
 * @returns {Collection} UI模型集合
 */
export function convertToUIModel(eventCollection: Collection<EventModel>) {
  // 创建新的UI模型集合，使用cid作为唯一标识符
  const uiModelColl = new Collection<EventUIModel>((uiModel) => {
    return uiModel.cid();
  });

  // 遍历事件集合，为每个事件创建对应的UI模型
  eventCollection.each(function (event) {
    uiModelColl.add(new EventUIModel(event));
  });

  return uiModelColl;
}
