import { useState } from 'react'

interface Props {
  label: string
  placeholder: string
  withPrice?: boolean
  onAdd: (text: string, price: number) => void
}

/** 한 줄 입력 후 Enter로 바로 추가하는 빠른 입력창. */
export function QuickAdd({ label, placeholder, withPrice, onAdd }: Props) {
  const [text, setText] = useState('')
  const [price, setPrice] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    const p = price === '' ? 0 : Number(price)
    onAdd(t, Number.isFinite(p) && p > 0 ? p : 0)
    setText('')
    setPrice('')
  }

  return (
    <form className="quick-add form" onSubmit={submit}>
      <input aria-label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
      {withPrice && (
        <input
          className="price"
          type="number"
          inputMode="numeric"
          min="0"
          step="100"
          aria-label={`${label} 예상 가격`}
          placeholder="가격(원)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      )}
      <button type="submit" className="primary">
        추가
      </button>
    </form>
  )
}
