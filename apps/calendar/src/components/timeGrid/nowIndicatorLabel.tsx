import { h } from 'preact';
import { useCallback, useMemo } from 'preact/hooks';

import { Template } from '@src/components/template';
import { addTimeGridPrefix, timeFormats } from '@src/components/timeGrid';
import { useTheme } from '@src/contexts/themeStore';
import { cls, toPercent } from '@src/helpers/css';
import { TEST_IDS } from '@src/test/testIds';
import type TZDate from '@src/time/date';
import { getDateDifference } from '@src/time/datetime';

import type { TimeUnit } from '@t/events';

// CSS 类名定义
const classNames = {
  now: addTimeGridPrefix('current-time'), // 当前时间指示器标签
  dayDifference: addTimeGridPrefix('day-difference'), // 日期差异显示
};

/**
 * NowIndicatorLabel 组件的属性接口
 */
interface Props {
  unit: TimeUnit; // 时间单位（如 'hour', 'minute' 等）
  top: number; // 标签的垂直位置（百分比）
  now: TZDate; // 当前时间（本地时区）
  zonedNow: TZDate; // 当前时间（目标时区）
}

/**
 * 当前时间指示器标签组件
 *
 * 该组件用于在时间网格中显示当前时间的标签，包括：
 * - 当前时间的格式化显示
 * - 时区差异的显示（如果有的话）
 *
 * @param unit - 时间单位，用于确定时间格式
 * @param top - 标签的垂直位置
 * @param now - 本地时区的当前时间
 * @param zonedNow - 目标时区的当前时间
 */
export function NowIndicatorLabel({ unit, top, now, zonedNow }: Props) {
  // 从主题中获取当前时间指示器标签的颜色
  const color = useTheme(useCallback((theme) => theme.week.nowIndicatorLabel.color, []));

  // 计算时区差异（天数差）
  const dateDifference = useMemo(() => {
    return getDateDifference(zonedNow, now);
  }, [zonedNow, now]);

  // 准备模板渲染的数据模型
  const model = {
    unit,
    time: zonedNow,
    format: timeFormats[unit],
  };

  return (
    <div
      className={cls(classNames.now)}
      style={{ top: toPercent(top), color }}
      data-testid={TEST_IDS.NOW_INDICATOR_LABEL}
    >
      {/* 如果存在时区差异，显示日期差异信息 */}
      {dateDifference !== 0 && (
        <span className={cls(classNames.dayDifference)}>{`[${
          dateDifference > 0 ? '+' : '-'
        }${Math.abs(dateDifference)}]`}</span>
      )}
      {/* 渲染当前时间的格式化标签 */}
      <Template template="timegridNowIndicatorLabel" param={model} as="span" />
    </div>
  );
}
