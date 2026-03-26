import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { WorkspacePage } from '../pages'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/chat" />,
      },
      {
        path: 'chat',
        element: <WorkspacePage />,
      },
      {
        path: 'settings',
        element: <WorkspacePage />,
      },
      {
        path: '*',
        element: <Navigate replace to="/chat" />,
      },
    ],
  },
])
