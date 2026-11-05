import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Sunny SAI · 웨비게이션',description:'내가 지날 길의 날씨를 먼저 살피는 차량용 음성 동승자',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg',apple:'/icon-192.png'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ko"><body>{children}</body></html>}
