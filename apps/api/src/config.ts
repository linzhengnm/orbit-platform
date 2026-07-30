export const config = {
  finnhubApiKey: process.env['FINNHUB_API_KEY'] ?? '',
  port: process.env['PORT'] ? Number(process.env['PORT']) : 3000,
  host: process.env['HOST'] ?? 'localhost',
  useFinnhub: process.env['FINNHUB_API_KEY'] ? true : false,
};
