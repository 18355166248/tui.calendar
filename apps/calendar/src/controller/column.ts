import { DEFAULT_DUPLICATE_EVENT_CID } from '@src/constants/layout';
import {
  COLLAPSED_DUPLICATE_EVENT_WIDTH_PX,
  TIME_EVENT_CONTAINER_MARGIN_LEFT,
} from '@src/constants/style';
import { createEventCollection } from '@src/controller/base';
import { getCollisionGroup, getMatrices } from '@src/controller/core';
import { getTopHeightByTime } from '@src/controller/times';
import { extractPercentPx, toPercent, toPx } from '@src/helpers/css';
import { isTimeEvent } from '@src/model/eventModel';
import type EventUIModel from '@src/model/eventUIModel';
import type TZDate from '@src/time/date';
import { addMinutes, max, min } from '@src/time/datetime';
import type { CollapseDuplicateEventsOptions } from '@src/types/options';
import array from '@src/utils/array';

// 最小高度百分比，确保事件有最小显示高度
const MIN_HEIGHT_PERCENT = 1;

/**
 * 渲染信息选项接口
 * 包含计算事件渲染位置和尺寸所需的所有参数
 */
interface RenderInfoOptions {
  baseWidth: number; // 基础宽度
  columnIndex: number; // 列索引
  renderStart: TZDate; // 渲染开始时间
  renderEnd: TZDate; // 渲染结束时间
  modelStart: TZDate; // 模型开始时间
  modelEnd: TZDate; // 模型结束时间
  goingStart: TZDate; // 前往开始时间（包含前置时间）
  comingEnd: TZDate; // 返回结束时间（包含后置时间）
  startColumnTime: TZDate; // 列开始时间
  endColumnTime: TZDate; // 列结束时间
}

/**
 * 事件过滤器：获取指定日期范围内的事件
 * @param {TZDate} startColumnTime - 开始日期
 * @param {TZDate} endColumnTime - 结束日期
 * @returns {function} 事件过滤函数
 */
export function isBetween(startColumnTime: TZDate, endColumnTime: TZDate) {
  return (uiModel: EventUIModel) => {
    const { goingDuration = 0, comingDuration = 0 } = uiModel.model;
    // 计算包含前置和后置时间的实际开始和结束时间
    const ownStarts = addMinutes(uiModel.getStarts(), -goingDuration);
    const ownEnds = addMinutes(uiModel.getEnds(), comingDuration);

    // 返回事件是否在指定时间范围内
    return !(ownEnds <= startColumnTime || ownStarts >= endColumnTime);
  };
}

/**
 * 设置事件内部高度信息
 * 计算前置时间、后置时间和主要事件的高度比例
 */
function setInnerHeights(uiModel: EventUIModel, options: RenderInfoOptions) {
  const { renderStart, renderEnd, modelStart, modelEnd } = options;
  const { goingDuration = 0, comingDuration = 0 } = uiModel.model;

  let modelDurationHeight = 100; // 主要事件高度百分比，初始为100%

  // 计算前置时间的高度
  if (goingDuration > 0) {
    const { height: goingDurationHeight } = getTopHeightByTime(
      renderStart,
      modelStart,
      renderStart,
      renderEnd
    );
    uiModel.goingDurationHeight = goingDurationHeight;
    modelDurationHeight -= goingDurationHeight;
  }

  // 计算后置时间的高度
  if (comingDuration > 0) {
    const { height: comingDurationHeight } = getTopHeightByTime(
      modelEnd,
      renderEnd,
      renderStart,
      renderEnd
    );
    uiModel.comingDurationHeight = comingDurationHeight;
    modelDurationHeight -= comingDurationHeight;
  }

  uiModel.modelDurationHeight = modelDurationHeight;
}

/**
 * 设置事件裁剪边缘信息
 * 标记事件是否被时间列边界裁剪
 */
function setCroppedEdges(uiModel: EventUIModel, options: RenderInfoOptions) {
  const { goingStart, comingEnd, startColumnTime, endColumnTime } = options;

  // 检查开始时间是否被裁剪
  if (goingStart < startColumnTime) {
    uiModel.croppedStart = true;
  }
  // 检查结束时间是否被裁剪
  if (comingEnd > endColumnTime) {
    uiModel.croppedEnd = true;
  }
}

/**
 * 计算重复事件的左侧位置
 * 基于前一个重复事件的位置和宽度计算当前事件的位置
 */
function getDuplicateLeft(uiModel: EventUIModel, baseLeft: number) {
  const { duplicateEvents, duplicateEventIndex } = uiModel;

  const prevEvent = duplicateEvents[duplicateEventIndex - 1];
  let left: number | string = baseLeft;

  if (prevEvent) {
    // 计算位置：前一个事件的左侧位置 + 前一个事件的宽度 + 左边距
    const { percent: leftPercent, px: leftPx } = extractPercentPx(`${prevEvent.duplicateLeft}`);
    const { percent: widthPercent, px: widthPx } = extractPercentPx(`${prevEvent.duplicateWidth}`);
    const percent = leftPercent + widthPercent;
    const px = leftPx + widthPx + TIME_EVENT_CONTAINER_MARGIN_LEFT;

    // 根据百分比和像素值组合计算最终位置
    if (percent !== 0) {
      left = `calc(${toPercent(percent)} ${px > 0 ? '+' : '-'} ${toPx(Math.abs(px))})`;
    } else {
      left = toPx(px);
    }
  } else {
    left = toPercent(left);
  }

  return left;
}

/**
 * 计算重复事件的宽度
 * 根据是否折叠状态返回不同的宽度值
 */
function getDuplicateWidth(uiModel: EventUIModel, baseWidth: number) {
  const { collapse } = uiModel;

  // 如果折叠：使用固定宽度
  // 如果展开：计算可用宽度减去其他重复事件的宽度和边距
  return collapse
    ? `${COLLAPSED_DUPLICATE_EVENT_WIDTH_PX}px`
    : `calc(${toPercent(baseWidth)} - ${toPx(
        (COLLAPSED_DUPLICATE_EVENT_WIDTH_PX + TIME_EVENT_CONTAINER_MARGIN_LEFT) *
          (uiModel.duplicateEvents.length - 1) +
          TIME_EVENT_CONTAINER_MARGIN_LEFT
      )})`;
}

/**
 * 设置事件的尺寸信息
 * 计算事件的位置、宽度、高度等渲染属性
 */
function setDimension(uiModel: EventUIModel, options: RenderInfoOptions) {
  const { startColumnTime, endColumnTime, baseWidth, columnIndex, renderStart, renderEnd } =
    options;
  const { duplicateEvents } = uiModel;

  // 计算事件在时间轴上的位置和高度
  const { top, height } = getTopHeightByTime(
    renderStart,
    renderEnd,
    startColumnTime,
    endColumnTime
  );

  const dimension = {
    top,
    left: baseWidth * columnIndex, // 基于列索引计算左侧位置
    width: baseWidth,
    height: Math.max(MIN_HEIGHT_PERCENT, height), // 确保最小高度
    duplicateLeft: '',
    duplicateWidth: '',
  };

  // 如果是重复事件，计算重复事件特有的位置和宽度
  if (duplicateEvents.length > 0) {
    dimension.duplicateLeft = getDuplicateLeft(uiModel, dimension.left);
    dimension.duplicateWidth = getDuplicateWidth(uiModel, dimension.width);
  }

  uiModel.setUIProps(dimension);
}

/**
 * 获取渲染信息选项
 * 根据事件模型和列信息计算渲染所需的所有参数
 */
function getRenderInfoOptions(
  uiModel: EventUIModel,
  columnIndex: number,
  baseWidth: number,
  startColumnTime: TZDate,
  endColumnTime: TZDate
) {
  const { goingDuration = 0, comingDuration = 0 } = uiModel.model;
  const modelStart = uiModel.getStarts();
  const modelEnd = uiModel.getEnds();

  // 计算包含前置和后置时间的完整时间范围
  const goingStart = addMinutes(modelStart, -goingDuration);
  const comingEnd = addMinutes(modelEnd, comingDuration);

  // 计算实际渲染的时间范围（与列时间范围取交集）
  const renderStart = max(goingStart, startColumnTime);
  const renderEnd = min(comingEnd, endColumnTime);

  return {
    baseWidth,
    columnIndex,
    modelStart,
    modelEnd,
    renderStart,
    renderEnd,
    goingStart,
    comingEnd,
    startColumnTime,
    endColumnTime,
    duplicateEvents: uiModel.duplicateEvents,
  };
}

/**
 * 设置单个事件的渲染信息
 * 递归处理重复事件，为每个事件设置完整的渲染属性
 */
function setRenderInfo({
  uiModel,
  columnIndex,
  baseWidth,
  startColumnTime,
  endColumnTime,
  isDuplicateEvent = false,
}: {
  uiModel: EventUIModel;
  columnIndex: number;
  baseWidth: number;
  startColumnTime: TZDate;
  endColumnTime: TZDate;
  isDuplicateEvent?: boolean;
}) {
  // 如果不是重复事件且存在重复事件组，递归处理所有重复事件
  if (!isDuplicateEvent && uiModel.duplicateEvents.length > 0) {
    uiModel.duplicateEvents.forEach((event) => {
      setRenderInfo({
        uiModel: event,
        columnIndex,
        baseWidth,
        startColumnTime,
        endColumnTime,
        isDuplicateEvent: true,
      });
    });

    return;
  }

  const renderInfoOptions = getRenderInfoOptions(
    uiModel,
    columnIndex,
    baseWidth,
    startColumnTime,
    endColumnTime
  );

  // 设置事件的尺寸、内部高度和裁剪边缘信息
  setDimension(uiModel, renderInfoOptions);
  setInnerHeights(uiModel, renderInfoOptions);
  setCroppedEdges(uiModel, renderInfoOptions);
}

/**
 * 设置重复事件组信息
 * 识别重复事件，设置折叠状态和主事件标识
 */
function setDuplicateEvents(
  uiModels: EventUIModel[],
  options: CollapseDuplicateEventsOptions,
  selectedDuplicateEventCid: number
) {
  const { getDuplicateEvents, getMainEvent } = options;

  const eventObjects = uiModels.map((uiModel) => uiModel.model.toEventObject());

  uiModels.forEach((targetUIModel) => {
    // 跳过已经处理过的事件
    if (targetUIModel.collapse || targetUIModel.duplicateEvents.length > 0) {
      return;
    }

    // 获取重复事件组
    const duplicateEvents = getDuplicateEvents(targetUIModel.model.toEventObject(), eventObjects);

    if (duplicateEvents.length <= 1) {
      return;
    }

    // 确定主事件
    const mainEvent = getMainEvent(duplicateEvents);

    // 获取重复事件的UI模型
    const duplicateEventUIModels = duplicateEvents.map(
      (event) => uiModels.find((uiModel) => uiModel.cid() === event.__cid) as EventUIModel
    );

    // 检查是否为选中的重复事件组
    const isSelectedGroup = !!(
      selectedDuplicateEventCid > DEFAULT_DUPLICATE_EVENT_CID &&
      duplicateEvents.find((event) => event.__cid === selectedDuplicateEventCid)
    );

    // 计算重复事件组的整体时间范围
    const duplicateStarts = duplicateEvents.reduce((acc, { start, goingDuration }) => {
      const renderStart = addMinutes(start, -goingDuration);
      return min(acc, renderStart);
    }, duplicateEvents[0].start);
    const duplicateEnds = duplicateEvents.reduce((acc, { end, comingDuration }) => {
      const renderEnd = addMinutes(end, comingDuration);
      return max(acc, renderEnd);
    }, duplicateEvents[0].end);

    // 为每个重复事件设置属性
    duplicateEventUIModels.forEach((event, index) => {
      const isMain = event.cid() === mainEvent.__cid;
      // 确定折叠状态：选中的事件或主事件保持展开
      const collapse = !(
        (isSelectedGroup && event.cid() === selectedDuplicateEventCid) ||
        (!isSelectedGroup && isMain)
      );

      event.setUIProps({
        duplicateEvents: duplicateEventUIModels,
        duplicateEventIndex: index,
        collapse,
        isMain,
        duplicateStarts,
        duplicateEnds,
      });
    });
  });

  return uiModels;
}

/**
 * 转换事件为EventUIModel并设置渲染信息
 * 这是主要的入口函数，处理事件列表的渲染信息计算
 * @param {EventUIModel[]} events - 事件列表
 * @param {TZDate} startColumnTime - 开始日期
 * @param {TZDate} endColumnTime - 结束日期
 * @param {number} selectedDuplicateEventCid - 选中的重复事件ID
 * @param {CollapseDuplicateEventsOptions} collapseDuplicateEventsOptions - 重复事件折叠选项
 */
export function setRenderInfoOfUIModels(
  events: EventUIModel[],
  startColumnTime: TZDate,
  endColumnTime: TZDate,
  selectedDuplicateEventCid: number,
  collapseDuplicateEventsOptions?: CollapseDuplicateEventsOptions
) {
  // 过滤时间事件并按开始时间排序
  const uiModels: EventUIModel[] = events
    .filter(isTimeEvent)
    .filter(isBetween(startColumnTime, endColumnTime))
    .sort(array.compare.event.asc);

  // 处理重复事件组
  if (collapseDuplicateEventsOptions) {
    setDuplicateEvents(uiModels, collapseDuplicateEventsOptions, selectedDuplicateEventCid);
  }

  // 过滤出展开的事件（非折叠状态）
  const expandedEvents = uiModels.filter((uiModel) => !uiModel.collapse);

  // 创建事件集合并计算碰撞组和矩阵
  const uiModelColl = createEventCollection(...expandedEvents);
  const usingTravelTime = true;
  const collisionGroups = getCollisionGroup(expandedEvents, usingTravelTime);
  const matrices = getMatrices(uiModelColl, collisionGroups, usingTravelTime);

  // 为每个矩阵中的事件设置渲染信息
  matrices.forEach((matrix) => {
    const maxRowLength = Math.max(...matrix.map((row) => row.length));
    const baseWidth = Math.round(100 / maxRowLength); // 计算基础宽度

    matrix.forEach((row) => {
      row.forEach((uiModel, columnIndex) => {
        setRenderInfo({ uiModel, columnIndex, baseWidth, startColumnTime, endColumnTime });
      });
    });
  });

  return uiModels;
}
