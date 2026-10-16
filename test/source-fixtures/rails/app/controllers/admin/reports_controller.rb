class Admin::ReportsController < Admin::BaseController
  def index
    @theme = cookies[:theme]
  end
end
