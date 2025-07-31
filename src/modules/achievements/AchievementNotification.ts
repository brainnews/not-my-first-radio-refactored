/**
 * Achievement notification component for displaying achievement unlocks
 */

import { Achievement } from '@/types/app';
import { createElement } from '@/utils/dom';
import { eventManager } from '@/utils/events';
import './achievement-notification.css';

export interface AchievementNotificationConfig {
  container?: HTMLElement;
  duration?: number;
  maxVisible?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}


/**
 * Handles achievement notification display
 */
const CONSTANTS = {
  DEFAULT_DURATION: 5000,
  DEFAULT_MAX_VISIBLE: 3,
  ANIMATION_DURATION: 300,
  CONTAINER_WIDTH: 320,
  CONTAINER_MARGIN: 20
} as const;

interface ResolvedConfig {
  duration: number;
  maxVisible: number;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  container?: HTMLElement;
}

export class AchievementNotification {
  private config: ResolvedConfig;
  private container!: HTMLElement;
  private activeNotifications: Set<HTMLElement> = new Set();

  constructor(config: AchievementNotificationConfig = {}) {
    this.config = {
      duration: CONSTANTS.DEFAULT_DURATION,
      maxVisible: CONSTANTS.DEFAULT_MAX_VISIBLE,
      position: 'top-right',
      ...config
    };

    this.setupContainer();
    this.setupEventListeners();
  }

  /**
   * Set up notification container
   */
  private setupContainer(): void {
    this.container = this.config.container || 
      (document.querySelector('.achievement-notification-container') as HTMLElement) ||
      this.createContainer();
  }

  private createContainer(): HTMLElement {
    const container = createElement('div', {
      className: `achievement-notification-container achievement-notifications-${this.config.position}`
    });
    document.body.appendChild(container);
    return container;
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    eventManager.on('achievement:unlocked', (achievement: Achievement) => {
      this.showAchievementNotification(achievement);
    });
  }


  /**
   * Show achievement notification
   */
  public showAchievementNotification(achievement: Achievement): void {
    this.showNotification(achievement);
  }

  /**
   * Show notification
   */
  private showNotification(achievement: Achievement): void {
    // Remove oldest notification if at max capacity
    if (this.activeNotifications.size >= this.config.maxVisible) {
      const oldest = Array.from(this.activeNotifications)[0];
      this.hideNotification(oldest);
    }

    const notification = this.createNotificationElement(achievement);
    this.container.appendChild(notification);
    this.activeNotifications.add(notification);

    // Trigger show animation
    requestAnimationFrame(() => {
      notification.classList.add('show', 'pulse');
    });

    // Auto-hide after duration
    setTimeout(() => {
      this.hideNotification(notification);
    }, this.config.duration);
  }

  /**
   * Create notification element
   */
  private createNotificationElement(achievement: Achievement): HTMLElement {
    const notification = createElement('div', {
      className: 'achievement-notification',
      onclick: () => {
        eventManager.emit('achievements:show-modal', achievement.id);
        this.hideNotification(notification);
      }
    });

    // Header with icon and title
    const header = createElement('div', { className: 'achievement-notification-header' });

    const icon = createElement('div', { className: 'achievement-notification-icon' });
    icon.textContent = achievement.icon || '🎉';
    header.appendChild(icon);

    const title = createElement('div', { className: 'achievement-notification-title' });
    title.textContent = 'Achievement Unlocked!';
    header.appendChild(title);

    notification.appendChild(header);

    // Close button
    const closeButton = createElement('button', {
      className: 'achievement-notification-close',
      onclick: (e: Event) => {
        e.stopPropagation();
        this.hideNotification(notification);
      }
    });
    closeButton.innerHTML = '×';
    notification.appendChild(closeButton);

    // Message
    const message = createElement('div', { className: 'achievement-notification-message' });
    message.textContent = `${achievement.icon} ${achievement.name}`;
    notification.appendChild(message);

    // Description
    if (achievement.description) {
      const description = createElement('div', { className: 'achievement-notification-description' });
      description.textContent = achievement.description;
      notification.appendChild(description);
    }

    // Progress bar for achievements with progress
    if (achievement.maxProgress && achievement.maxProgress > 1) {
      const progressContainer = createElement('div', { className: 'achievement-notification-progress' });
      const progressBar = createElement('div', { className: 'achievement-notification-progress-bar' });
      
      const progress = (achievement.progress || 0) / achievement.maxProgress * 100;
      progressBar.style.width = `${progress}%`;
      
      progressContainer.appendChild(progressBar);
      notification.appendChild(progressContainer);
    }

    return notification;
  }

  /**
   * Hide notification
   */
  private hideNotification(notification: HTMLElement): void {
    if (!this.activeNotifications.has(notification)) return;

    notification.classList.remove('show');
    notification.classList.add('hide');

    setTimeout(() => {
      notification.remove();
      this.activeNotifications.delete(notification);
    }, CONSTANTS.ANIMATION_DURATION);
  }

  /**
   * Clear all notifications
   */
  public clearAll(): void {
    this.activeNotifications.forEach(notification => {
      this.hideNotification(notification);
    });
  }

  /**
   * Destroy notification system
   */
  public destroy(): void {
    this.clearAll();
    eventManager.removeAllListeners('achievement:unlocked');
    
    if (this.container?.parentNode && !this.config.container) {
      this.container.remove();
    }
  }
}