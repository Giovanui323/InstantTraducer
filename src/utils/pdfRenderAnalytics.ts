import { log } from '../services/logger';

export interface RenderAnalytics {
  totalAttempts: number;
  successfulRenders: number;
  failedRenders: number;
  cancelledRenders: number;
  corruptedPages: Set<number>;
  averageAttemptsPerPage: number;
  renderTimes: Record<number, number[]>;
  qualityReductions: Record<number, number>;
}

class PdfRenderAnalytics {
  private analytics: RenderAnalytics = {
    totalAttempts: 0,
    successfulRenders: 0,
    failedRenders: 0,
    cancelledRenders: 0,
    corruptedPages: new Set(),
    averageAttemptsPerPage: 0,
    renderTimes: {},
    qualityReductions: {}
  };

  recordRenderAttempt(pageNum: number, quality: number = 1.0): void {
    this.analytics.totalAttempts++;
    
    if (!this.analytics.renderTimes[pageNum]) {
      this.analytics.renderTimes[pageNum] = [];
    }
    
    // Track quality reduction
    if (quality < 1.0) {
      this.analytics.qualityReductions[pageNum] = Math.min(
        this.analytics.qualityReductions[pageNum] || 1.0,
        quality
      );
    }
    
    log.debug(`Render attempt recorded for page ${pageNum}, quality: ${quality}`);
  }

  recordRenderSuccess(pageNum: number, renderTime: number, attempts: number = 1): void {
    this.analytics.successfulRenders++;
    
    if (!this.analytics.renderTimes[pageNum]) {
      this.analytics.renderTimes[pageNum] = [];
    }
    
    this.analytics.renderTimes[pageNum].push(renderTime);
    
    // Update average attempts per page
    this.updateAverageAttempts();
    
    log.info(`Page ${pageNum} rendered successfully in ${renderTime}ms after ${attempts} attempt(s)`);
  }

  recordRenderFailure(pageNum: number, error: any, attempts: number = 1): void {
    this.analytics.failedRenders++;
    
    const isCancelled = error?.name === 'RenderingCancelledException' || 
                       error?.message?.includes('cancelled');
    
    if (isCancelled) {
      this.analytics.cancelledRenders++;
      log.warning(`Page ${pageNum} render cancelled after ${attempts} attempt(s)`);
    } else {
      log.error(`Page ${pageNum} render failed after ${attempts} attempt(s)`, error);
    }
  }

  recordCorruptedPage(pageNum: number): void {
    this.analytics.corruptedPages.add(pageNum);
    log.warning(`Page ${pageNum} marked as corrupted`);
  }

  private updateAverageAttempts(): void {
    const totalPages = Object.keys(this.analytics.renderTimes).length;
    if (totalPages > 0) {
      this.analytics.averageAttemptsPerPage = this.analytics.totalAttempts / totalPages;
    }
  }

  getAnalytics(): RenderAnalytics {
    return { ...this.analytics };
  }

  getPageStats(pageNum: number): {
    attempts: number;
    averageTime: number;
    minQuality: number;
    isCorrupted: boolean;
  } {
    const renderTimes = this.analytics.renderTimes[pageNum] || [];
    const attempts = renderTimes.length;
    const averageTime = attempts > 0 ? renderTimes.reduce((a, b) => a + b, 0) / attempts : 0;
    const minQuality = this.analytics.qualityReductions[pageNum] || 1.0;
    const isCorrupted = this.analytics.corruptedPages.has(pageNum);
    
    return {
      attempts,
      averageTime: Math.round(averageTime),
      minQuality,
      isCorrupted
    };
  }

  generateReport(): string {
    const stats = {
      totalPages: Object.keys(this.analytics.renderTimes).length,
      successRate: this.analytics.totalAttempts > 0 ? 
        (this.analytics.successfulRenders / this.analytics.totalAttempts * 100).toFixed(1) : '0',
      averageAttempts: this.analytics.averageAttemptsPerPage.toFixed(2),
      corruptedPagesCount: this.analytics.corruptedPages.size,
      cancelledRate: this.analytics.totalAttempts > 0 ?
        (this.analytics.cancelledRenders / this.analytics.totalAttempts * 100).toFixed(1) : '0'
    };
    
    return `PDF Render Analytics Report:
- Total Pages Processed: ${stats.totalPages}
- Success Rate: ${stats.successRate}%
- Average Attempts per Page: ${stats.averageAttempts}
- Corrupted Pages Detected: ${stats.corruptedPagesCount}
- Cancelled Render Rate: ${stats.cancelledRate}%
- Total Render Attempts: ${this.analytics.totalAttempts}`;
  }

  reset(): void {
    this.analytics = {
      totalAttempts: 0,
      successfulRenders: 0,
      failedRenders: 0,
      cancelledRenders: 0,
      corruptedPages: new Set(),
      averageAttemptsPerPage: 0,
      renderTimes: {},
      qualityReductions: {}
    };
    log.info('PDF render analytics reset');
  }
}

export const pdfRenderAnalytics = new PdfRenderAnalytics();