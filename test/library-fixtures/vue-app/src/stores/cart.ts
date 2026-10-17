import { defineStore } from 'pinia'

export const useCartStore = defineStore('cart', { state: () => ({ items: 0 }), actions: { add() { this.items++ } } })
