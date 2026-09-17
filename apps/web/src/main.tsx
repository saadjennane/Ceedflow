import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Shell } from './app/Shell';
import { ApplyPage } from './pages/ApplyPage';
import { BookingPage } from './pages/BookingPage';
import { EditionPage } from './pages/EditionPage';
import { ProgramPage } from './pages/ProgramPage';
import { ProgramsPage } from './pages/ProgramsPage';
import { ToastProvider } from './ui/Overlays';
import './ui/app.css';

const router = createBrowserRouter([
  { path: '/apply/:token', element: <ApplyPage /> },
  { path: '/book/:token', element: <BookingPage /> },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <ProgramsPage /> },
      { path: 'programs/:programId', element: <ProgramPage /> },
      { path: 'editions/:editionId', element: <EditionPage /> },
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
