import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { DiagramPage } from '../pages'

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
        element: <DiagramPage />,
      },
      {
        path: 'settings',
        element: <DiagramPage />,
      },
      {
        path: '*',
        element: <Navigate replace to="/chat" />,
      },
    ],
  },
])
