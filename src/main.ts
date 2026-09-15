import { createApp } from 'vue'
// 顺序：element-plus 深色变量表 → element-plus 组件样式 → 本项目覆盖 →
// 最后挂载。src/style.css 用 html.dark 覆盖设计令牌，必须在变量表之后加载。
import 'element-plus/theme-chalk/dark/css-vars.css'
import './element-plus-styles'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')
