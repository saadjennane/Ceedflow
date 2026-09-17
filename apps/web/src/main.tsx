import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Shell } from './app/Shell';
import { ApplyPage } from './pages/ApplyPage';
import { BookingPage } from './pages/BookingPage';
import { EditionPage } from './pages/EditionPage';
import { JoinPage } from './pages/JoinPage';
import { DirectoryPage } from './pages/directory/DirectoryPage';
import { RecordPage } from './pages/directory/RecordPage';
import { ProgramPage } from './pages/ProgramPage';
import { ProgramsPage } from './pages/ProgramsPage';
import { ToastProvider } from './ui/Overlays';
import './ui/app.css';

const router = createBrowserRouter([
  { path: '/apply/:token', element: <ApplyPage /> },
  { path: '/book/:token', element: <BookingPage /> },
  { path: '/join', element: <JoinPage /> },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <ProgramsPage /> },
      { path: 'programs/:programId', element: <ProgramPage /> },
      { path: 'editions/:editionId', element: <EditionPage /> },
      { path: 'organisations', element: <DirectoryPage kind="org" /> },
      { path: 'individuals', element: <DirectoryPage kind="person" /> },
      { path: 'directory/:recordId', element: <RecordPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </StrictMode>,
);
