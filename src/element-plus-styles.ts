// element-plus 样式：组件本身由 unplugin-vue-components 按需自动导入
// （见 vite.config.ts 的 ElementPlusResolver，importStyle: false），
// 样式则在这里显式列出——这样整体只打包用到的组件样式，
// 同时不会让 .css 导入渗进单元测试（Node 的 ESM loader 不认识 .css）。
//
// 新增任何 el-* 组件时，记得在下面补一行对应的 style/css。
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/collapse/style/css'
import 'element-plus/es/components/collapse-item/style/css'
import 'element-plus/es/components/dropdown/style/css'
import 'element-plus/es/components/dropdown-item/style/css'
import 'element-plus/es/components/dropdown-menu/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/input-number/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/table-column/style/css'
