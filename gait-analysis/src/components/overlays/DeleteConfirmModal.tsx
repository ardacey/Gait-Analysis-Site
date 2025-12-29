import { AlertCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card'

interface DeleteConfirmModalProps {
  onCancel: () => void
  onConfirm: () => void
}

export function DeleteConfirmModal({ onCancel, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-red-600">
            <AlertCircle className="h-5 w-5" /> Emin misiniz?
          </CardTitle>
          <CardDescription>Bu videoyu kalıcı olarak silmek üzeresiniz.</CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Evet, Sil
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
