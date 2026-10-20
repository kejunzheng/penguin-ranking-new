/**
 * 请求接口
 * 端内通过 jsapi 代理请求（可携带 cookie），端外通过 axios
 */
import axios from 'axios';
import { isQQNews } from '@tencent/qn-utils';
import { sendRequest } from '@tencent/qqnews-jsapi';

interface RequestParams {
  api: string;
  method: 'GET' | 'POST';
  query: Record<string, any>;
  headers?: Record<string, string>;
  isForm?: boolean;
}

export const commonRequest = async (params: RequestParams) => {
  const { api, method, query, headers = {}, isForm = false } = params;

  // 端内请求
  if (isQQNews()) {
    const sendRequestParams: any = {
      url: api,
      method,
      data: { ...query },
    };
    if (!isForm) {
      sendRequestParams.contentTypeJSON = 1;
    }
    const result = await sendRequest(sendRequestParams);
    const { errCode = '', response = '' } = result;
    if (errCode === '0') {
      return JSON.parse(response);
    }
    return {};
  }

  // 端外请求
  let result;
  if (method === 'GET') {
    result = await axios.get(api, {
      params: query,
      headers,
      withCredentials: true,
    });
  } else {
    result = await axios.post(api, query, {
      headers,
      withCredentials: true,
    });
  }
  return result?.data;
};
