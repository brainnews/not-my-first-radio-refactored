/**
 * Modal management system for overlays and dialogs
 */

import { ModalType, ModalState } from '@/types/app';
import { createElement, addEventListenerWithCleanup } from '@/utils/dom';
import { eventManager } from '@/utils/events';

export interface ModalManagerConfig {
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  preventBodyScroll?: boolean;
}

interface ModalDefinition {
  type: ModalType;
  title?: string;
  content: HTMLElement | string;
  actions?: ModalAction[];
  size?: 'small' | 'medium' | 'large' | 'fullscreen';
  closable?: boolean;
  showHeader?: boolean;
}

interface ModalAction {
  label: string;
  action: () => void | Promise<void>;
  style?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

/**
 * Manages modal dialogs and overlays
 */
export class ModalManager {
  private currentModal: HTMLElement | null = null;
  private modalState: ModalState;
  private config: ModalManagerConfig;
  private cleanupFunctions: (() => void)[] = [];
  private modalCleanupFunctions: (() => void)[] = [];
  private bodyScrollPosition: number = 0;

  constructor(config: ModalManagerConfig = {}) {
    this.config = {
      closeOnEscape: true,
      closeOnOverlayClick: true,
      preventBodyScroll: true,
      ...config
    };

    this.modalState = {
      type: null,
      isOpen: false,
      data: null
    };

    this.setupEventListeners();
    this.setupKeyboardHandlers();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    eventManager.on('modal:open', (modal: ModalDefinition) => {
      this.open(modal);
    });

    eventManager.on('modal:close', () => {
      this.close();
    });

    eventManager.on('modal:toggle', (modal: ModalDefinition) => {
      if (this.modalState.isOpen && this.modalState.type === modal.type) {
        this.close();
      } else {
        this.open(modal);
      }
    });
  }

  /**
   * Set up keyboard handlers
   */
  private setupKeyboardHandlers(): void {
    if (this.config.closeOnEscape) {
      const cleanup = addEventListenerWithCleanup(document.body, 'keydown', (event) => {
        if (event.key === 'Escape' && this.modalState.isOpen) {
          this.close();
        }
      });
      this.cleanupFunctions.push(cleanup);
    }
  }

  /**
   * Open a modal
   */
  open(modal: ModalDefinition): void {
    // Close existing modal first
    if (this.currentModal) {
      this.close();
    }

    // Update state
    this.modalState = {
      type: modal.type,
      isOpen: true,
      data: modal
    };

    // Prevent body scroll
    if (this.config.preventBodyScroll) {
      this.bodyScrollPosition = window.pageYOffset;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${this.bodyScrollPosition}px`;
      document.body.style.width = '100%';
    }

    // Create modal element
    this.currentModal = this.createModalElement(modal);
    document.body.appendChild(this.currentModal);

    // Trigger animation
    requestAnimationFrame(() => {
      if (this.currentModal) {
        this.currentModal.classList.add('modal-show');
      }
    });

    // Focus management
    this.manageFocus();

    eventManager.emit('modal:opened', modal.type);
  }

  /**
   * Close the current modal
   */
  close(): void {
    if (!this.currentModal || !this.modalState.isOpen) {
      return;
    }

    const modalType = this.modalState.type;

    // Clean up modal-specific event listeners
    this.modalCleanupFunctions.forEach(cleanup => cleanup());
    this.modalCleanupFunctions = [];

    // Trigger close animation
    this.currentModal.classList.add('modal-hide');

    // Use animation events for better performance
    const handleAnimationEnd = () => {
      if (this.currentModal && this.currentModal.parentNode) {
        this.currentModal.removeEventListener('animationend', handleAnimationEnd);
        this.currentModal.removeEventListener('transitionend', handleAnimationEnd);
        this.currentModal.parentNode.removeChild(this.currentModal);
      }
      this.currentModal = null;

      // Restore body scroll
      if (this.config.preventBodyScroll) {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, this.bodyScrollPosition);
      }

      // Update state
      this.modalState = {
        type: null,
        isOpen: false,
        data: null
      };

      eventManager.emit('modal:closed', modalType);
    };

    // Listen for both animation and transition end events
    this.currentModal.addEventListener('animationend', handleAnimationEnd);
    this.currentModal.addEventListener('transitionend', handleAnimationEnd);
    
    // Fallback timeout in case animation events don't fire
    setTimeout(handleAnimationEnd, 350);
  }

  /**
   * Create modal element
   */
  private createModalElement(modal: ModalDefinition): HTMLElement {
    // Modal overlay
    const overlay = createElement('div', {
      className: `modal modal-${modal.size || 'medium'}`,
      onclick: (event: Event) => {
        if (this.config.closeOnOverlayClick && event.target === overlay) {
          this.close();
        }
      }
    });

    // Modal container
    const container = createElement('div', { className: 'modal-container' });

    // Determine if header should be shown
    const shouldShowHeader = modal.showHeader !== false && (modal.title || modal.closable !== false);

    // Modal header (conditional)
    if (shouldShowHeader) {
      const header = createElement('div', { className: 'modal-header' });
      
      if (modal.title) {
        const title = createElement('h2', { className: 'modal-title' }, [modal.title]);
        header.appendChild(title);
      }

      if (modal.closable !== false) {
        const closeButton = createElement('button', {
          className: 'modal-close',
          onclick: () => this.close()
        }, ['×']);
        header.appendChild(closeButton);
      }

      container.appendChild(header);
    } else if (modal.closable !== false && !shouldShowHeader) {
      // Add floating close button for header-less modals
      const floatingClose = createElement('button', {
        className: 'modal-close modal-close-floating',
        onclick: () => this.close()
      }, ['×']);
      container.appendChild(floatingClose);
    }

    // Modal body
    const body = createElement('div', { className: 'modal-body' });
    if (typeof modal.content === 'string') {
      body.innerHTML = modal.content;
    } else {
      body.appendChild(modal.content);
    }
    container.appendChild(body);

    // Modal actions
    if (modal.actions && modal.actions.length > 0) {
      const actionsContainer = createElement('div', { className: 'modal-actions' });
      
      modal.actions.forEach(action => {
        const button = createElement('button', {
          className: `modal-action modal-action-${action.style || 'secondary'}`,
          disabled: action.disabled || false,
          onclick: async () => {
            try {
              await action.action();
              this.close();
            } catch (error) {
              console.error('Modal action error:', error);
            }
          }
        }, [action.label]);
        
        actionsContainer.appendChild(button);
      });

      container.appendChild(actionsContainer);
    }

    overlay.appendChild(container);
    return overlay;
  }

  /**
   * Manage focus for accessibility
   */
  private manageFocus(): void {
    if (!this.currentModal) return;

    // Find first focusable element
    const focusableElements = this.currentModal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length > 0) {
      // For header-less modals, prefer focusing the first interactive element in modal body
      const hasHeader = this.currentModal.querySelector('.modal-header');
      if (!hasHeader) {
        const bodyFocusable = this.currentModal.querySelector('.modal-body button, .modal-body [href], .modal-body input, .modal-body select, .modal-body textarea, .modal-body [tabindex]:not([tabindex="-1"])') as HTMLElement;
        if (bodyFocusable) {
          bodyFocusable.focus();
        } else {
          (focusableElements[0] as HTMLElement).focus();
        }
      } else {
        (focusableElements[0] as HTMLElement).focus();
      }
    }

    // Trap focus within modal
    const cleanup = addEventListenerWithCleanup(this.currentModal, 'keydown', (event) => {
      if (event.key === 'Tab') {
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    });

    this.modalCleanupFunctions.push(cleanup);
  }

  /**
   * Convenience methods for common modal types
   */

  /**
   * Create simple text content element
   */
  private createTextContent(message: string): HTMLElement {
    return createElement('p', {}, [message]);
  }

  /**
   * Show confirmation dialog
   */
  confirm(
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    onCancel?: () => void
  ): void {
    this.open({
      type: 'confirmation',
      title,
      content: this.createTextContent(message),
      size: 'small',
      actions: [
        {
          label: 'Cancel',
          action: onCancel || (() => {}),
          style: 'secondary'
        },
        {
          label: 'Confirm',
          action: onConfirm,
          style: 'primary'
        }
      ]
    });
  }

  /**
   * Show alert dialog
   */
  alert(title: string, message: string, onOk?: () => void): void {
    this.open({
      type: 'alert',
      title,
      content: this.createTextContent(message),
      size: 'small',
      actions: [
        {
          label: 'OK',
          action: onOk || (() => {}),
          style: 'primary'
        }
      ]
    });
  }

  /**
   * Show QR code modal
   */
  showQRCode(title: string, qrCodeDataUrl: string, instructions?: string): void {
    const content = createElement('div', { className: 'qr-modal-content' });
    
    const qrImage = createElement('img', {
      src: qrCodeDataUrl,
      alt: 'QR Code',
      className: 'qr-code-image'
    });
    content.appendChild(qrImage);

    if (instructions) {
      const instructionsElement = createElement('p', { className: 'qr-instructions' }, [instructions]);
      content.appendChild(instructionsElement);
    }

    this.open({
      type: 'qr-code',
      title,
      content,
      size: 'medium'
    });
  }

  /**
   * Show add station modal
   */
  showAddStation(onAdd: (stationData: any) => void): void {
    const content = this.createAddStationForm(onAdd);
    
    this.open({
      type: 'add-station',
      title: 'Add Station Manually',
      content,
      size: 'medium'
    });
  }

  /**
   * Create add station form
   */
  private createAddStationForm(onAdd: (stationData: any) => void): HTMLElement {
    const form = createElement('form', { className: 'add-station-form' });
    const inputs: { [key: string]: HTMLInputElement } = {};

    // Helper function to create form groups
    const createFormGroup = (name: string, label: string, type: string, required = false, placeholder?: string) => {
      const group = createElement('div', { className: 'form-group' });
      const labelEl = createElement('label', {}, [required ? `${label} *` : label]);
      const input = createElement('input', {
        type,
        required,
        placeholder: placeholder || ''
      }) as HTMLInputElement;
      
      inputs[name] = input;
      group.appendChild(labelEl);
      group.appendChild(input);
      return group;
    };

    // Required fields
    form.appendChild(createFormGroup('url', 'Stream URL', 'url', true, 'https://example.com/stream.mp3'));
    form.appendChild(createFormGroup('name', 'Station Name', 'text', true, 'Enter station name'));

    // Optional fields
    form.appendChild(createFormGroup('favicon', 'Favicon URL', 'url', false, 'https://example.com/favicon.ico'));
    form.appendChild(createFormGroup('homepage', 'Homepage URL', 'url', false, 'https://example.com'));
    form.appendChild(createFormGroup('bitrate', 'Bitrate', 'number', false, '128'));
    form.appendChild(createFormGroup('country', 'Country Code', 'text', false, 'US'));

    // Submit button
    const submitButton = createElement('button', {
      type: 'submit',
      className: 'form-submit'
    }, ['Add Station']);
    form.appendChild(submitButton);

    // Handle form submission
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      
      // Validate required fields
      if (!inputs.url.value.trim() || !inputs.name.value.trim()) {
        return;
      }

      const stationData = {
        url: inputs.url.value.trim(),
        name: inputs.name.value.trim(),
        stationuuid: `manual_${Date.now()}`,
        favicon: inputs.favicon.value.trim() || undefined,
        homepage: inputs.homepage.value.trim() || undefined,
        bitrate: inputs.bitrate.value ? parseInt(inputs.bitrate.value, 10) : undefined,
        country: inputs.country.value.trim().toUpperCase() || undefined
      };

      // Filter out undefined values
      Object.keys(stationData).forEach(key => {
        if ((stationData as any)[key] === undefined) {
          delete (stationData as any)[key];
        }
      });

      onAdd(stationData);
    });

    return form;
  }

  /**
   * Get current modal state
   */
  getState(): ModalState {
    return { ...this.modalState };
  }

  /**
   * Check if a modal is currently open
   */
  isOpen(): boolean {
    return this.modalState.isOpen;
  }

  /**
   * Check if a specific modal type is open
   */
  isModalOpen(type: ModalType): boolean {
    return this.modalState.isOpen && this.modalState.type === type;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.close();
    
    // Clean up event listeners
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];

    eventManager.removeAllListeners('modal:open');
    eventManager.removeAllListeners('modal:close');
    eventManager.removeAllListeners('modal:toggle');
  }
}