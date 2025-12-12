// src/components/inpatient/ErrorAlert.tsx
export default function ErrorAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="text-red-500 text-left space-y-1">
      <div>错误：{message}</div>
      <div className="text-xs text-gray-600">
        如果提示“网络错误/请求超时”，多为前端代理未连通或后端未启动。开发时可设置{" "}
        <code>VITE_API_BASE</code> 指向后端地址，或检查 Vite 代理与后端服务。
      </div>
    </div>
  );
}
