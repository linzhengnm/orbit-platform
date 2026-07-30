import { render, screen } from '@testing-library/react';

import App from './app';

describe('App', () => {
  it('renders the earnings comparison demo', () => {
    render(<App />);

    expect(screen.getByText('Earnings Comparison Demo')).toBeTruthy();
    expect(screen.getByText('Q1 2025')).toBeTruthy();
    expect(screen.getByText('Q4 2024')).toBeTruthy();
  });
});
