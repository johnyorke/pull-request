import './styles.css';
import { App } from './ui/app';

const root = document.querySelector<HTMLDivElement>('#app');

if (root === null) {
  throw new Error('Missing #app mount point');
}

new App(root);
