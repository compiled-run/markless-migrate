<script setup lang="ts">
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/vue'
import { useMouse } from '@vueuse/core'
import { useCartStore } from '../stores/cart'

const { x, y } = useMouse({ type: 'client' })
const cart = useCartStore()
</script>

<template>
  <Menu as="div" class="relative">
    <MenuButton class="btn">Options</MenuButton>
    <MenuItems :unmount="false">
      <MenuItem v-slot="{ active }"><a href="/account" :class="{ active }">Account</a></MenuItem>
    </MenuItems>
  </Menu>
  <v-btn color="primary" @click="cart.add()">Add {{ x }} {{ y }}</v-btn>
</template>
