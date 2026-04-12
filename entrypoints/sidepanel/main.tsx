import '../../src/styles/sidepanel.css';

import ReactDOM from 'react-dom/client';

import { SidePanel } from '../../src/components/SidePanel';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<SidePanel />);
}
