/**
 * Animation utilities for enhanced user interactions
 */

/**
 * Add a ripple effect to an element on click
 */
export function addRippleEffect(element: HTMLElement, event: MouseEvent): void {
  const ripple = document.createElement('span');
  const rect = element.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  ripple.classList.add('ripple-effect');

  element.appendChild(ripple);

  // Remove ripple after animation
  setTimeout(() => {
    ripple.remove();
  }, 600);
}

/**
 * Add smooth transition classes to an element
 */
export function addTransitionClasses(element: HTMLElement, classes: string[]): void {
  element.classList.add(...classes);
}

/**
 * Remove transition classes after a delay
 */
export function removeTransitionClasses(element: HTMLElement, classes: string[], delay = 300): void {
  setTimeout(() => {
    element.classList.remove(...classes);
  }, delay);
}

/**
 * Animate element entrance with staggered timing
 */
export function animateElementsSequentially(elements: HTMLElement[], delay = 100): void {
  elements.forEach((element, index) => {
    setTimeout(() => {
      element.classList.add('animate-in');
    }, index * delay);
  });
}

/**
 * Add loading spinner to an element
 */
export function showLoadingSpinner(container: HTMLElement, text = 'Loading...'): HTMLElement {
  const spinner = document.createElement('div');
  spinner.className = 'loading-container';
  spinner.innerHTML = `
    <div class="loading-spinner"></div>
    <span class="loading-text">${text}</span>
  `;
  
  container.appendChild(spinner);
  return spinner;
}

/**
 * Remove loading spinner from an element
 */
export function hideLoadingSpinner(container: HTMLElement): void {
  const spinner = container.querySelector('.loading-container');
  if (spinner) {
    spinner.remove();
  }
}

/**
 * Animate number counting up
 */
export function animateNumber(
  element: HTMLElement, 
  start: number, 
  end: number, 
  duration = 1000,
  suffix = ''
): void {
  const range = end - start;
  const startTime = performance.now();

  function updateNumber(currentTime: number) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function for smooth animation
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (range * easeOut));
    
    element.textContent = current + suffix;
    
    if (progress < 1) {
      requestAnimationFrame(updateNumber);
    }
  }
  
  requestAnimationFrame(updateNumber);
}

/**
 * Add hover tilt effect to an element
 */
export function addHoverTilt(element: HTMLElement): void {
  element.addEventListener('mouseenter', () => {
    element.style.transform = 'perspective(1000px) rotateX(5deg) rotateY(-5deg) scale3d(1.05, 1.05, 1.05)';
  });
  
  element.addEventListener('mouseleave', () => {
    element.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  });
}

/**
 * Parallax scroll effect for elements
 */
export function addParallaxEffect(elements: HTMLElement[], speed = 0.5): void {
  function updateParallax() {
    const scrolled = window.pageYOffset;
    
    elements.forEach(element => {
      const rate = scrolled * speed;
      element.style.transform = `translateY(${rate}px)`;
    });
  }
  
  window.addEventListener('scroll', updateParallax);
}

/**
 * Smooth scroll to element
 */
export function smoothScrollTo(element: HTMLElement, offset = 0): void {
  const targetPosition = element.offsetTop - offset;
  
  window.scrollTo({
    top: targetPosition,
    behavior: 'smooth'
  });
}