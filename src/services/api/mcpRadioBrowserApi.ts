/**
 * MCP Radio Browser API service for natural language search
 */

import { RadioStation } from '@/types/station';

/**
 * MCP API response interfaces
 */
interface McpApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface McpSearchResponse {
  query: string;
  results: RadioStation[];
  count: number;
}

/**
 * MCP Radio Browser API client for natural language search
 */
export class McpRadioBrowserApi {
  private readonly baseUrl = 'https://radio-browser-mcp.miles-gilbert.workers.dev';
  private readonly timeout = 15000; // 15 seconds

  /**
   * Make API request to MCP server
   */
  private async makeRequest<T>(
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<McpApiResponse<T>> {
    try {
      const url = new URL(`${this.baseUrl}${endpoint}`);
      
      // Add parameters to URL
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value.toString());
        }
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NotMyFirstRadio/2.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: true, data };

    } catch (error) {
      console.warn('[McpRadioBrowserApi] Request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'MCP API request failed'
      };
    }
  }

  /**
   * Search stations using natural language query
   */
  async searchStationsNatural(query: string, limit?: number): Promise<McpApiResponse<RadioStation[]>> {
    const params: Record<string, any> = { q: query };
    if (limit) {
      params.limit = limit;
    }

    const response = await this.makeRequest<McpSearchResponse>('/api/search/natural', params);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.results
      };
    }
    
    return {
      success: false,
      error: response.error || 'Natural search failed'
    };
  }

  /**
   * Test MCP API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.searchStationsNatural('test', 1);
      return response.success;
    } catch {
      return false;
    }
  }

  /**
   * Get base URL for reference
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

// Create singleton instance
export const mcpRadioBrowserApi = new McpRadioBrowserApi();