/**
 * Notification and toast message system
 */

import { Notification, NotificationType } from '@/types/app';
import { createElement } from '@/utils/dom';
import { eventManager } from '@/utils/events';

export interface NotificationManagerConfig {
  container?: HTMLElement;
  maxNotifications?: number;
  defaultDuration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

/**
 * Manages toast notifications and alerts
 */
export class NotificationManager {
  private static readonly ANIMATION_DURATION = 300;
  
  private container: HTMLElement;
  private notifications: Map<string, HTMLElement> = new Map();
  private timeouts: Map<string, number> = new Map();
  private maxNotifications: number;
  private defaultDuration: number;
  private position: NotificationManagerConfig['position'];

  constructor(config: NotificationManagerConfig = {}) {
    this.maxNotifications = config.maxNotifications || 5;
    this.defaultDuration = config.defaultDuration || 2000;
    this.position = config.position || 'top-right';

    this.container = config.container || this.createContainer();
    this.setupEventListeners();
  }

  /**
   * Create notification container if it doesn't exist
   */
  private createContainer(): HTMLElement {
    let container = document.querySelector('.notification-container') as HTMLElement;
    
    if (!container) {
      container = createElement('div', {
        className: `notification-container notification-${this.position}`
      });
      document.body.appendChild(container);
    }

    return container;
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    eventManager.on('notification:show', (notification: Notification) => {
      this.show(notification);
    });

    eventManager.on('notification:hide', (notificationId: string) => {
      this.hide(notificationId);
    });

    eventManager.on('notification:clear-all', () => {
      this.clearAll();
    });
  }

  /**
   * Generate unique notification ID
   */
  private generateId(): string {
    return `notification_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Show a notification
   */
  show(notification: Partial<Notification>): string {
    const id = notification.id || this.generateId();
    const duration = notification.duration ?? this.defaultDuration;

    // Remove oldest notification if at max capacity
    if (this.notifications.size >= this.maxNotifications) {
      const oldestId = this.notifications.keys().next().value;
      if (oldestId) {
        this.hide(oldestId);
      }
    }

    const completeNotification: Notification = {
      id,
      type: notification.type || 'info',
      message: notification.message || '',
      duration,
      action: notification.action
    };

    const notificationElement = this.createNotificationElement(completeNotification);

    this.container.appendChild(notificationElement);
    this.notifications.set(id, notificationElement);

    // Trigger animation
    requestAnimationFrame(() => {
      notificationElement.classList.add('notification-show');
    });

    // Auto-hide after duration
    if (duration > 0) {
      const timeoutId = window.setTimeout(() => {
        this.hide(id);
      }, duration);
      this.timeouts.set(id, timeoutId);
    }

    eventManager.emit('notification:shown', { id, type: notification.type });
    return id;
  }

  /**
   * Hide a notification
   */
  hide(notificationId: string): boolean {
    const element = this.notifications.get(notificationId);
    if (!element) {
      return false;
    }

    // Clear any pending timeout
    const timeoutId = this.timeouts.get(notificationId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      this.timeouts.delete(notificationId);
    }

    element.classList.add('notification-hide');
    
    setTimeout(() => {
      element.remove();
      this.notifications.delete(notificationId);
    }, NotificationManager.ANIMATION_DURATION);

    eventManager.emit('notification:hidden', notificationId);
    return true;
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    Array.from(this.notifications.keys()).forEach(id => {
      this.hide(id);
    });
  }

  /**
   * Create notification element
   */
  private createNotificationElement(notification: Notification): HTMLElement {
    const element = createElement('div', {
      className: `notification notification-${notification.type}`,
      dataset: { notificationId: notification.id }
    });

    // Icon based on type
    const icon = this.getNotificationIcon(notification.type);
    const iconElement = createElement('span', { className: 'notification-icon' }, [icon]);
    element.appendChild(iconElement);

    // Message
    const messageElement = createElement('div', { className: 'notification-message' }, [notification.message]);
    element.appendChild(messageElement);

    // Action button if provided
    if (notification.action) {
      const actionButton = createElement('button', {
        className: 'notification-action',
        onclick: () => {
          notification.action!.callback();
          this.hide(notification.id);
        }
      }, [notification.action.label]);
      element.appendChild(actionButton);
    }

    // Close button
    const closeButton = createElement('button', {
      className: 'notification-close',
      onclick: () => this.hide(notification.id)
    }, ['×']);
    element.appendChild(closeButton);

    // Progress bar for timed notifications
    if (notification.duration && notification.duration > 0) {
      const progressBar = createElement('div', { className: 'notification-progress' });
      element.appendChild(progressBar);

      // Animate progress bar
      requestAnimationFrame(() => {
        progressBar.style.animationDuration = `${notification.duration}ms`;
        progressBar.classList.add('notification-progress-animate');
      });
    }

    return element;
  }

  /**
   * Get icon for notification type
   */
  private getNotificationIcon(type: NotificationType): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  /**
   * Convenience methods for different notification types
   */
  private showTypedNotification(
    type: NotificationType, 
    message: string, 
    duration?: number, 
    action?: Notification['action']
  ): string {
    const finalDuration = type === 'error' ? (duration ?? 0) : duration;
    return this.show({ type, message, duration: finalDuration, action });
  }

  success(message: string, duration?: number, action?: Notification['action']): string {
    return this.showTypedNotification('success', message, duration, action);
  }

  error(message: string, duration?: number, action?: Notification['action']): string {
    return this.showTypedNotification('error', message, duration, action);
  }

  warning(message: string, duration?: number, action?: Notification['action']): string {
    return this.showTypedNotification('warning', message, duration, action);
  }

  info(message: string, duration?: number, action?: Notification['action']): string {
    return this.showTypedNotification('info', message, duration, action);
  }

  /**
   * Get notification count
   */
  getNotificationCount(): number {
    return this.notifications.size;
  }

  /**
   * Check if a notification exists
   */
  hasNotification(notificationId: string): boolean {
    return this.notifications.has(notificationId);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Clear all timeouts
    this.timeouts.forEach(timeoutId => window.clearTimeout(timeoutId));
    this.timeouts.clear();
    
    this.clearAll();
    this.container.remove();
    
    eventManager.removeAllListeners('notification:show');
    eventManager.removeAllListeners('notification:hide');
    eventManager.removeAllListeners('notification:clear-all');
  }
}