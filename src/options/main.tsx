import { render } from 'preact';
import { OptionsApp } from './App';
import './options.css';

const root = document.getElementById('root');

if (root) {
  render(<OptionsApp />, root);
}
