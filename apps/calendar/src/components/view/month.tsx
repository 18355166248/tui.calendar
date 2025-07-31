/**
 * 月视图组件 - 显示日历的月视图
 * 该组件负责渲染整个月视图，包括星期标题行和日期网格
 */

import { h } from 'preact';
import { useMemo } from 'preact/hooks';

import { GridHeader } from '@src/components/dayGridCommon/gridHeader';
import { DayGridMonth } from '@src/components/dayGridMonth/dayGridMonth';
import { Layout } from '@src/components/layout';
import { useStore } from '@src/contexts/calendarStore';
import { cls } from '@src/helpers/css';
import { createDateMatrixOfMonth } from '@src/helpers/grid';
import { optionsSelector, viewSelector } from '@src/selectors';
import { getRowStyleInfo, isWeekend } from '@src/time/datetime';
import { capitalize } from '@src/utils/string';

import type { MonthOptions } from '@t/options';
import type { CalendarStore } from '@t/store';
import type { CellInfo } from '@t/time/datetime';

/**
 * 获取月视图的星期标题信息
 * @param options - 日历配置选项
 * @returns 星期标题数组，包含日期索引和显示标签
 */
function getMonthDayNames(options: CalendarStore['options']) {
  // 从配置中提取月视图相关的选项
  const { dayNames, startDayOfWeek, workweek } = options.month as Required<MonthOptions>;

  // 生成一周7天的索引数组，根据起始星期调整顺序
  const dayIndices = [...Array(7)].map((_, i) => (startDayOfWeek + i) % 7);

  // 将索引转换为星期标题对象，包含日期索引和首字母大写的标签
  const monthDayNames = dayIndices.map((i) => ({
    day: i,
    label: capitalize(dayNames[i]),
  }));

  // 如果启用工作日模式，过滤掉周末
  return monthDayNames.filter((dayNameInfo) => (workweek ? !isWeekend(dayNameInfo.day) : true));
}

/**
 * 月视图主组件
 * 负责渲染完整的月视图，包括星期标题和日期网格
 */
export function Month() {
  // 从全局状态获取日历配置选项
  const options = useStore(optionsSelector);
  // 从全局状态获取当前渲染的日期
  const { renderDate } = useStore(viewSelector);

  // 获取星期标题信息
  const dayNames = getMonthDayNames(options);
  // 提取月视图特定的配置选项
  const monthOptions = options.month as Required<MonthOptions>;
  const { narrowWeekend, startDayOfWeek, workweek } = monthOptions;

  /**
   * 创建月视图的日期矩阵
   * 使用 useMemo 优化性能，只有当月份选项或渲染日期变化时才重新计算
   */
  const dateMatrix = useMemo(
    () => createDateMatrixOfMonth(renderDate, monthOptions),
    [monthOptions, renderDate]
  );

  /**
   * 计算行样式信息和单元格宽度映射
   * 使用 useMemo 优化性能，只有当相关配置变化时才重新计算
   */
  const { rowStyleInfo, cellWidthMap } = useMemo(
    () => getRowStyleInfo(dayNames.length, narrowWeekend, startDayOfWeek, workweek),
    [dayNames.length, narrowWeekend, startDayOfWeek, workweek]
  );

  /**
   * 创建行信息数组，将样式信息与对应的日期结合
   * 每行包含样式信息和该行对应的日期信息
   */
  const rowInfo: CellInfo[] = rowStyleInfo.map((cellStyleInfo, index) => ({
    ...cellStyleInfo,
    date: dateMatrix[0][index],
  }));

  /**
   * 渲染月视图布局
   * 使用 Layout 组件作为容器，包含星期标题和日期网格两部分
   */
  return (
    <Layout className={cls('month')}>
      {/* 渲染星期标题行 */}
      <GridHeader
        type="month"
        dayNames={dayNames}
        options={monthOptions}
        rowStyleInfo={rowStyleInfo}
      />
      {/* 渲染日期网格 */}
      <DayGridMonth dateMatrix={dateMatrix} rowInfo={rowInfo} cellWidthMap={cellWidthMap} />
    </Layout>
  );
}
