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
 * 这是事件布局算法的第一步，为后续的矩阵布局提供基础数据
 *
 * @param {Array<EventModel|EventUIModel>} events - 事件模型或UI模型列表，按时间排序
 * @param {boolean} [usingTravelTime = true] - 是否考虑行程时间，影响事件重叠判断
 * @returns {Array<number[]>} 碰撞组数组，每个子数组包含同一时间段内重叠的事件ID
 *
 * 算法详细说明：
 * 1. 初始化：第一个事件总是第一个碰撞组的开始
 * 2. 遍历剩余事件（从第二个开始）：
 *    - 对于每个事件，检查是否与之前的所有事件重叠
 *    - 如果不重叠，创建新的碰撞组
 *    - 如果重叠，将事件添加到包含重叠事件的碰撞组中
 * 3. 重叠判断：使用事件的 collidesWith 方法，考虑时间范围和行程时间
 *
 * 示例：
 * 事件A: 9:00-10:00, 事件B: 9:30-10:30, 事件C: 11:00-12:00
 * 结果: [[A, B], [C]]  // A和B重叠，C独立
 *
 * 注意：此函数假设输入的事件已经按开始时间排序
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
 * 用于在矩阵布局算法中确定事件应该放置的行位置
 *
 * @param {array[]} matrix - 二维矩阵，matrix[row][col] 结构
 * @param {number} col - 要检查的列索引
 * @returns {number} 该列中最后一个非空行的索引，如果列为空则返回-1
 *
 * 算法说明：
 * 1. 从矩阵的最后一行开始向上遍历
 * 2. 检查指定列中每一行是否有值（非undefined）
 * 3. 返回第一个找到非空值的行索引
 * 4. 如果整列都为空，返回-1
 *
 * 用途：
 * - 在事件布局中，确定当前列可以放置新事件的位置
 * - 避免事件重叠，确保垂直方向上的合理排列
 *
 * 示例：
 * matrix = [
 *   [A, B, C],
 *   [D, undefined, E],
 *   [F, G, undefined]
 * ]
 * getLastRowInColumn(matrix, 0) => 2 (F在最后一行)
 * getLastRowInColumn(matrix, 1) => 2 (G在最后一行)
 * getLastRowInColumn(matrix, 2) => 1 (E在倒数第二行)
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
 * 根据碰撞组信息，为每个事件分配在矩阵中的位置，实现日历视图中事件块的合理排列
 *
 * @param {Collection<T>} collection - 事件模型集合，包含所有需要布局的事件
 * @param {CollisionGroup} collisionGroups - 碰撞组数组，每个子数组包含同一时间段内重叠的事件ID
 * @param {boolean} [usingTravelTime = true] - 是否考虑行程时间，影响事件重叠判断
 * @returns {Matrix3d<T>} 三维矩阵数组，每个子矩阵代表一个碰撞组的二维布局
 *
 * 算法详细说明：
 * 1. 遍历每个碰撞组，为每个组创建一个独立的二维矩阵
 * 2. 对于组内每个事件，从左到右（列）寻找合适的位置：
 *    - 如果当前列没有事件，直接放在第一行
 *    - 如果当前列有事件但不重叠，放在该列的下一行
 *    - 如果重叠，尝试下一列，直到找到合适位置
 * 3. 矩阵结构：matrix[row][col] = event，其中：
 *    - row: 垂直位置（从上到下）
 *    - col: 水平位置（从左到右）
 *    - event: 事件对象
 *
 * 布局策略：
 * - 优先填充左侧列，减少水平空间占用
 * - 同一列中的事件按时间顺序垂直排列
 * - 重叠事件通过增加列数来避免冲突
 *
 * 示例：
 * 假设有3个重叠事件A、B、C，可能的布局：
 * 矩阵1: [[A], [B], [C]]  (垂直排列)
 * 矩阵2: [[A, B], [C]]    (A、B水平排列，C在下一行)
 * 矩阵3: [[A], [B, C]]    (A单独一行，B、C水平排列)
 */
export function getMatrices<T extends EventModel | EventUIModel>(
  collection: Collection<T>,
  collisionGroups: CollisionGroup,
  usingTravelTime = true
): Matrix3d<T> {
  const result: Matrix3d<T> = [];

  // 为每个碰撞组创建独立的矩阵布局
  collisionGroups.forEach((group) => {
    // 初始化二维矩阵，第一行作为起始行
    const matrix: Matrix<T> = [[]];

    // 为组内每个事件分配在矩阵中的具体位置
    group.forEach((eventID) => {
      const event = collection.get(eventID) as T;
      let col = 0; // 当前尝试的列索引
      let found = false; // 是否找到合适位置的标志
      let nextRow; // 下一行的索引
      let lastRowInColumn; // 当前列中最后一个非空行的索引

      // 从左到右逐列寻找合适的位置，直到找到不重叠的位置
      while (!found) {
        // 获取当前列中最后一个非空行的索引
        lastRowInColumn = getLastRowInColumn(matrix, col);

        if (lastRowInColumn === -1) {
          // 情况1：当前列完全没有事件，直接放在第一行
          matrix[0].push(event);
          found = true;
        } else if (!event.collidesWith(matrix[lastRowInColumn][col], usingTravelTime)) {
          // 情况2：当前列有事件，但当前事件与最后一个事件不重叠
          // 将事件放在该列的下一行
          nextRow = lastRowInColumn + 1;
          // 如果下一行不存在，创建新行
          if (isUndefined(matrix[nextRow])) {
            matrix[nextRow] = [];
          }
          matrix[nextRow][col] = event;
          found = true;
        }

        // 情况3：当前位置不合适（与现有事件重叠），尝试下一列
        col += 1;
      }
    });

    // 将当前碰撞组的矩阵添加到结果中
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
 * 这是事件布局算法的最后一步，将矩阵布局转换为具体的UI位置坐标
 *
 * @param {TZDate} start - 渲染的开始日期，用于计算水平位置基准
 * @param {TZDate} end - 渲染的结束日期，用于计算水平位置基准
 * @param {Matrix3d<EventUIModel>} matrices - 控制器计算出的三维矩阵布局
 * @param {function} [iteratee] - 可选的迭代函数，对每个UI模型执行额外操作（如样式设置）
 *
 * 位置计算逻辑：
 * 1. top: 事件在矩阵中的行索引，决定垂直位置
 * 2. left: 事件开始日期在渲染日期范围内的索引，决定水平起始位置
 * 3. width: 事件跨越的天数，决定水平宽度
 *
 * 坐标系统：
 * - 垂直方向：基于矩阵行索引，0表示最顶部
 * - 水平方向：基于日期索引，0表示渲染范围的开始日期
 * - 宽度：基于事件持续天数，1表示一天
 *
 * 示例：
 * 渲染范围：2024-01-01 到 2024-01-07
 * 事件A：2024-01-02 到 2024-01-04，在矩阵第0行
 * 结果：{ top: 0, left: 1, width: 3 }
 *
 * 注意：此函数会直接修改UI模型的属性，不返回新对象
 */
export function positionUIModels(
  start: TZDate,
  end: TZDate,
  matrices: Matrix3d<EventUIModel>,
  iteratee?: (uiModel: EventUIModel) => void
) {
  // 生成要渲染的日期列表（YYYYMMDD格式），用于计算水平位置
  // 例如：['20240101', '20240102', '20240103', ...]
  const ymdListToRender = makeDateRange(start, end, MS_PER_DAY).map((date) =>
    toFormat(date, 'YYYYMMDD')
  );

  // 遍历所有碰撞组的矩阵
  matrices.forEach((matrix) => {
    // 遍历矩阵中的每一列（水平方向）
    matrix.forEach((column) => {
      // 遍历列中的每个UI模型（垂直方向）
      column.forEach((uiModel, index) => {
        // 跳过空位置（矩阵中可能存在undefined）
        if (!uiModel) {
          return;
        }

        // 获取事件开始日期的YYYYMMDD格式，用于在日期列表中查找位置
        const ymd = toFormat(uiModel.getStarts(), 'YYYYMMDD');

        // 计算事件跨越的天数（从开始日期的开始到结束日期的结束）
        // 使用toStartOfDay和toEndOfDay确保包含完整的天数
        const dateLength = makeDateRange(
          toStartOfDay(uiModel.getStarts()),
          toEndOfDay(uiModel.getEnds()),
          MS_PER_DAY
        ).length;

        // 设置UI模型的位置属性
        uiModel.top = index; // 在列中的行位置（垂直坐标）
        uiModel.left = ymdListToRender.indexOf(ymd); // 在日期列表中的位置（水平坐标）
        uiModel.width = dateLength; // 事件跨越的宽度（天数）

        // 执行可选的迭代函数，可用于设置额外的样式或属性
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
