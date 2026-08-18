import axios, { AxiosInstance } from 'axios';
import { BetConfig, RaceResult } from './types';

export class ApiClient {
  private axiosInstance: AxiosInstance;
  private baseUrl = 'https://gewinnspiel.spezi.com/wp-admin/admin-ajax.php';
  private cookies: string;

  constructor(cookies: string) {
    this.cookies = cookies;
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'accept': '*/*',
        'accept-language': 'de,de-DE;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'origin': 'https://gewinnspiel.spezi.com',
        'pragma': 'no-cache',
        'referer': 'https://gewinnspiel.spezi.com/vespa-race/',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'x-requested-with': 'XMLHttpRequest',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0'
      },
      withCredentials: true
    });

    // Set cookies
    this.axiosInstance.defaults.headers.common['Cookie'] = cookies;
  }

  async placeBet(betConfig: BetConfig): Promise<RaceResult> {
    try {
      const params = new URLSearchParams();
      params.append('action', betConfig.action);
      params.append('nonce', betConfig.nonce);
      params.append('race_id', betConfig.race_id.toString());
      params.append('bet_type', betConfig.bet_type);
      params.append('picks', String(betConfig.picks));
      params.append('stake', betConfig.stake.toString());

      const response = await this.axiosInstance.post('', params.toString());

      if (!response.data.success) {
        throw new Error(`API Error: ${response.data.data?.error || 'Unknown error'}`);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to place bet: ${error.message}`);
      }
      throw error;
    }
  }
}
