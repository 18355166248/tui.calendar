import CustomEvents from 'tui-code-snippet/customEvents/customEvents';

import type { AnyFunc } from '@t/eventBus';

/**
 * 事件总线接口
 * 提供类型安全的事件发布-订阅模式
 * @template EventTypes 事件类型映射，键为事件名，值为事件处理函数类型
 */
export interface EventBus<
  EventTypes extends {
    [key: string]: AnyFunc;
  }
> {
  /**
   * 注册事件监听器
   * @template EventName 事件名称类型
   * @param eventName 事件名称
   * @param handler 事件处理函数
   * @returns 返回事件总线实例，支持链式调用
   */
  on<EventName extends keyof EventTypes>(
    eventName: EventName,
    handler: EventTypes[EventName]
  ): EventBus<EventTypes>;

  /**
   * 移除事件监听器
   * @template EventName 事件名称类型
   * @param eventName 事件名称（可选，不传则移除所有事件）
   * @param handler 事件处理函数（可选，不传则移除该事件的所有监听器）
   * @returns 返回事件总线实例，支持链式调用
   */
  off<EventName extends keyof EventTypes>(
    eventName?: EventName,
    handler?: EventTypes[EventName]
  ): EventBus<EventTypes>;

  /**
   * 注册一次性事件监听器（只执行一次后自动移除）
   * @template EventName 事件名称类型
   * @param eventName 事件名称
   * @param handler 事件处理函数
   * @returns 返回事件总线实例，支持链式调用
   */
  once<EventName extends keyof EventTypes>(
    eventName: EventName,
    handler: EventTypes[EventName]
  ): EventBus<EventTypes>;

  /**
   * 触发事件
   * @template EventName 事件名称类型
   * @param eventName 事件名称
   * @param args 传递给事件处理函数的参数
   * @returns 返回事件总线实例，支持链式调用
   */
  fire<EventName extends keyof EventTypes>(
    eventName: EventName,
    ...args: Parameters<EventTypes[EventName]>
  ): EventBus<EventTypes>;
}

/**
 * 事件总线实现类
 * 继承自 CustomEvents，提供类型安全的事件管理功能
 * @template EventTypes 事件类型映射，键为事件名，值为事件处理函数类型
 */
export class EventBusImpl<
    EventTypes extends {
      [key: string]: AnyFunc;
    }
  >
  extends CustomEvents
  implements EventBus<EventTypes>
{
  /**
   * 注册事件监听器
   * @param eventName 事件名称
   * @param handler 事件处理函数
   * @returns 返回当前实例，支持链式调用
   */
  on<EventName extends keyof EventTypes>(eventName: EventName, handler: EventTypes[EventName]) {
    super.on(eventName as string, handler);

    return this;
  }

  /**
   * 移除事件监听器
   * @param eventName 事件名称（可选）
   * @param handler 事件处理函数（可选）
   * @returns 返回当前实例，支持链式调用
   */
  off<EventName extends keyof EventTypes>(eventName?: EventName, handler?: EventTypes[EventName]) {
    super.off(eventName as string, handler);

    return this;
  }

  /**
   * 触发事件
   * @param eventName 事件名称
   * @param args 传递给事件处理函数的参数
   * @returns 返回当前实例，支持链式调用
   */
  fire<EventName extends keyof EventTypes>(
    eventName: EventName,
    ...args: Parameters<EventTypes[EventName]>
  ) {
    super.fire(eventName as string, ...args);

    return this;
  }

  /**
   * 注册一次性事件监听器
   * @param eventName 事件名称
   * @param handler 事件处理函数
   * @returns 返回当前实例，支持链式调用
   */
  once<EventName extends keyof EventTypes>(eventName: EventName, handler: EventTypes[EventName]) {
    super.once(eventName as string, handler);

    return this;
  }
}
